const Groq = require('groq-sdk');
const path = require('path');
require('dotenv').config({ 
    path: path.join(__dirname, '../../.env'),
    override: true 
});

// Load key from env
const apiKey = process.env.GROQ_API_KEY || '';
if (!apiKey) {
    console.error('❌ No GROQ_API_KEY found in environment variables!');
}

const client = new Groq({ apiKey });

const SUPPORTED_MODELS = [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b'
];

const executeWithFallback = async (createCall) => {
    let lastError = null;
    for (const model of SUPPORTED_MODELS) {
        try {
            return await createCall(client, model);
        } catch (error) {
            lastError = error;
            const isRateLimit = error?.status === 429 || 
                                error?.code === 'rate_limit_exceeded';
            
            if (isRateLimit) {
                console.warn(`⚠️ Groq Rate Limit on model ${model}, trying next fallback model...`);
                continue;
            }
            console.warn(`⚠️ Groq error on model ${model} (${error.message}), trying next fallback...`);
        }
    }

    if (lastError?.status === 429 || lastError?.code === 'rate_limit_exceeded') {
        const AIUsage = require('../models/AIUsage');
        await AIUsage.logError(true).catch(() => {});
        throw new Error('rate_limit_exceeded');
    }
    throw lastError || new Error('All AI models failed');
};

const parseJobWithAI = async (rawText) => {
  try {
     const completion = await executeWithFallback(async (client, model) => {
        return await client.chat.completions.create({
            messages: [
                {
                    role: 'system',
                content: `The current year is ${new Date().getFullYear()}. Extract JSON from job post.
Fields: title, company, location, salary, eligibility, lastDate, applyUrl.
Arrays: 
- rolesResponsibility: Array of strings (NOT objects). Example: ["Design API", "Fix bugs"].
- requirements: Array of strings.
- niceToHave: Array of strings.
- batch: Array of strings (e.g. ["2024", "2025", "2026", "2027", "2028"]). Extract the EXACT year(s) mentioned in the job post title or description. Do NOT default to older years.
- tags: Array of strings (tech stack).
Enums: jobType(String: Internship/FullTime), roleType(String: SDE/Frontend/Backend/Engineering/etc), seniority(String: Entry/Mid/Senior), isRemote(bool).
Rules:
- Title: Role only (e.g. "Graduate Engineer Trainee" without "Hiring for" or company name).
- Company: Exact company name (e.g. "Jio", "Reliance Jio", "Flex", "Infineon", "Amazon"). Never return "Unknown" if company name is in the title or text.
- Batch: Extract batch years EXACTLY as mentioned. If the title says "2026", batch must include "2026". If "Fresher" is mentioned without a year, use the current year ${new Date().getFullYear()}.
- Tags: Array of STRINGS only (e.g. ["Java", "React"]). NO objects.
- Role/Seniority: Return a single STRING value, not an object.
- Output: Valid JSON only. No markdown.`
                },
                {
                    role: 'user',
                    content: rawText
                }
            ],
            model: model,
            response_format: { type: 'json_object' }
        });
    });

    // Log token usage
    const tokens = completion.usage?.total_tokens || 0;
    try {
      const AIUsage = require('../models/AIUsage');
      await AIUsage.logUsage(tokens, 'job_parsing', 0);
    } catch (e) { /* silent fail */ }

    const content = completion.choices[0]?.message?.content || '{}';
    // Clean up content: sometimes it adds markdown markers despite JSON mode
    const cleanContent = content.replace(/```json\n?|```/g, '').trim();
    
    // Robust JSON extraction
    const startObj = cleanContent.indexOf('{');
    const endObj = cleanContent.lastIndexOf('}');
    
    let jsonString = '{}';
    if (startObj !== -1 && endObj !== -1) {
        jsonString = cleanContent.substring(startObj, endObj + 1);
    }

    try {
        return JSON.parse(jsonString);
    } catch (e) {
        // Last ditch attempt: fix common trailing comma issue and unquoted keys
        const fixedJson = jsonString
            .replace(/,\s*([\]}])/g, '$1') // Trailing commas
            .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":'); // Unquoted keys
        return JSON.parse(fixedJson);
    }
  } catch (error) {
    if (error.message === 'rate_limit_exceeded') {
        return { error: 'rate_limit_exceeded' };
    }
    console.error('AI Parsing Error:', error.message);
    return null;
  }
};

/**
 * Generate SEO-optimized title and description for job listings
 */
const generateSEOContent = async (jobData) => {
  try {
    const prompt = `You are an SEO expert for a job portal. Generate SEO-optimized, professional content for this job.

Company: ${jobData.company}
Original Title: ${jobData.title}
Role/Category: ${jobData.role || 'Professional'}
Location: ${jobData.location || 'Not Specified'}
Salary: ${jobData.salary || 'Competitive'}
Batch: ${jobData.batch || 'Not specified'}

Original Description:
${jobData.description?.substring(0, 800)}

Generate JSON with these fields:
1. "title": Clean, SEO-friendly title (Examples: "Software Engineer at Google", "QA Automation Engineer - Python", "Data Scientist at Amazon", "Frontend Developer - React"). 
2. "description": A compelling 2-3 sentence meta description (max 160 chars) summarizing why this is a great opportunity.
3. "rolesResponsibility": Array of strings (clear, concise responsibilities).
4. "requirements": Array of strings (technical and soft skill requirements).
5. "eligibility": A concise eligibility criteria string (e.g., "B.Tech/B.E. 2025/2026 Batch").
6. "salary": A string representing the salary (e.g., "₹4-6 LPA" or "Competitive").
7. "batch": Array of strings (e.g., ["2024", "2025", "2026"]). Extract EXACT years from the original title/description.
8. "tags": Array of strings (Tech Stack, frameworks, soft skills).
9. "seniority": "Entry", "Mid", or "Senior".
10. "jobType": "FullTime", "Internship".
11. "companyInsights": Write 2 detailed, highly unique, and engaging paragraphs discussing why working at this company (or a similar company) as this role is a great career move. Make it sound insightful and original. (Must be a String).
12. "interviewTips": Write 2 detailed, highly unique and role-specific paragraphs on how a candidate can best prepare for an interview for this exact position. Give actionable, non-generic advice. (Must be a String).

Rules:
- Title must be purely the role and company.
- Content should be professional.
- For 'batch', only include years (e.g., 2024, 2025, 2026).
- For 'tags', include specific tech mentioned in the description (e.g., Java, Python, React, DSA). Prioritize specific languages and frameworks over general skills.
- The 'companyInsights' and 'interviewTips' fields MUST be detailed, well-written paragraphs that add massive unique value to the page (crucial for SEO).
- Output ONLY valid JSON. No markdown tags. No extra text. Ensure all strings are double-quoted. No trailing commas.`;

    const completion = await executeWithFallback(async (client, model) => {
        return await client.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are an SEO content generator. Output only valid JSON.' },
                { role: 'user', content: prompt }
            ],
            model: model,
            response_format: { type: 'json_object' }
        });
    });

    // Log token usage
    const tokens = completion.usage?.total_tokens || 0;
    try {
      const AIUsage = require('../models/AIUsage');
      await AIUsage.logUsage(tokens, 'seoGeneration', 0);
    } catch (e) { /* silent fail */ }

    const content = completion.choices[0]?.message?.content || '{}';
    const cleanContent = content.replace(/```json\n?|```/g, '').trim();
    
    // Robust JSON extraction
    const startObj = cleanContent.indexOf('{');
    const endObj = cleanContent.lastIndexOf('}');
    
    let jsonString = '{}';
    if (startObj !== -1 && endObj !== -1) {
        jsonString = cleanContent.substring(startObj, endObj + 1);
    }
    
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        const fixedJson = jsonString
            .replace(/,\s*([\]}])/g, '$1')
            .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
        return JSON.parse(fixedJson);
    }
  } catch (error) {
    if (error.message === 'rate_limit_exceeded') {
        return { error: 'rate_limit_exceeded' };
    }
    console.error('SEO Generation Error:', error.message);
    return null;
  }
};

module.exports = { parseJobWithAI, generateSEOContent };
