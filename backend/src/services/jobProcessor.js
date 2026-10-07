const { generateSEOContent } = require('./groq');
const { cleanTitle, mapJobType, parseMinSalary, parseBatches } = require('../utils/jobHelpers');
const { uploadToCloudinary } = require('../utils/cloudinaryUploader');

/**
 * Shared Job Processor Service
 * Unifies the AI refinement and schema mapping logic for all job sources.
 */

const finalizeJobData = async (refinedData, rawData = {}) => {
    // Helper to format AI list output
    const formatAiValue = (val) => {
        if (!val) return '';
        if (Array.isArray(val)) return val.join('\n');
        return String(val);
    };

    // Helper to clean tags (max 3 words, max 25 chars)
    const cleanTags = (tags) => {
        if (!Array.isArray(tags)) return [];
        return tags
            .map(t => typeof t === 'string' ? t.trim() : (t?.name || String(t))) // Handle objects/nulls
            .filter(t => t && t.length > 1 && t.length <= 25 && t.split(' ').length <= 3);
    };

    // Helper to clean location (convert array to string if needed)
    const cleanLocation = (loc) => {
        if (!loc) return '';
        if (Array.isArray(loc)) return loc.map(l => typeof l === 'object' ? (l.city || l.name || JSON.stringify(l)) : l).join(', ');
        if (typeof loc === 'object') return loc.city || loc.name || JSON.stringify(loc);
        return String(loc).trim();
    };

    // Helper to clean category (fallback if too long)
    const cleanCategory = (cat) => {
        if (!cat) return 'Engineering';
        const strCat = typeof cat === 'string' ? cat : (cat.name || String(cat));
        if (strCat.length > 30) return 'Engineering';
        return strCat.trim();
    };

    // Helper to clean salary (handle objects from AI)
    const cleanSalary = (sal) => {
        if (!sal) return '';
        if (typeof sal === 'object') {
            const min = sal.min || sal.minimum || '';
            const max = sal.max || sal.maximum || '';
            if (min && max) return `₹${min}-${max} LPA`;
            if (min) return `₹${min} LPA`;
            return JSON.stringify(sal);
        }
        return String(sal).trim();
    };

    // Helper to extract company name from title
    const extractCompanyFromTitle = (title) => {
        if (!title) return '';
        const match = title.match(/^([^|]+?)\s+(?:Off Campus|Hiring|Recruitment|Drive|Careers|Internship|Jobs|Job)/i);
        if (match && match[1]) {
            const cleaned = match[1].replace(/^(?:Direct|Urgent|Latest|New)\s+/i, '').trim();
            if (cleaned) return cleaned;
        }
        return '';
    };

    // Helper to clean raw HTML / promotional spam from description
    const cleanDescription = (desc) => {
        if (!desc) return '';
        let d = String(desc);
        // Remove script tags and contents
        d = d.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        // Remove promotional lines & WhatsApp/Telegram groups
        d = d.replace(/<p[^>]*>(?:<strong>)?(?:Instant Job Updates|Join our Official|Join Official|Official WhatsApp|Official Telegram|Official Instagram|Apply Link\s*:|How To Apply)[^<]*(?:<a[^>]*>[^<]*<\/a>)?[^<]*<\/p>/gi, '');
        d = d.replace(/(?:Instant Job Updates|Join our Official WhatsApp|Join our Official Telegram|Join our Official Instagram|Apply Link\s*:|How To Apply)[^\n]+/gi, '');
        // Remove wp-block-image figures
        d = d.replace(/<figure[^>]*>.*?<\/figure>/gis, '');
        // Remove empty paragraphs
        d = d.replace(/<p[^>]*>\s*<\/p>/gi, '');
        return d.trim();
    };

    // Helper to simple string (roleType, etc)
    const cleanString = (val, defaultVal = '') => {
        if (!val) return defaultVal;
        if (typeof val === 'string') return val.trim();
        return val.name || val.title || val.label || JSON.stringify(val);
    };

    const finalCompany = (() => {
        const c = (refinedData.company && refinedData.company !== 'Unknown') 
            ? refinedData.company 
            : ((rawData.company && rawData.company !== 'Unknown') ? rawData.company : '');
        if (c) return c;
        const fromTitle = extractCompanyFromTitle(rawData.title || refinedData.title);
        return fromTitle || 'Unknown';
    })();

    const finalLocation = (() => {
        const l = cleanLocation(refinedData.location || rawData.location);
        if (l && l !== 'Not Specified' && l !== 'Pending' && l !== 'Pending AI') return l;
        const locMatch = (rawData.title || '').match(/\|\s*([^|]+)$/);
        return (locMatch && locMatch[1]) ? locMatch[1].trim() : (l || 'Remote');
    })();

    return {
        title: refinedData.title || cleanTitle(rawData.title),
        company: finalCompany,
        companyLogo: refinedData.companyLogo || rawData.companyLogo,
        location: finalLocation,
        eligibility: refinedData.eligibility || rawData.eligibility || '',
        salary: cleanSalary(refinedData.salary || rawData.salary) || 'Competitive',
        description: cleanDescription(refinedData.description || rawData.description || ''),
        // Prioritize raw captured link as AI often hallucinations hub links
        applyUrl: rawData.applyUrl || refinedData.applyUrl || '',
        category: cleanCategory(refinedData.category || rawData.category),
        batch: (() => {
            let baseBatch = parseBatches(rawData.batch && rawData.batch.length > 0 ? rawData.batch : refinedData.batch);
            // Fallback: extract years from title/eligibility to catch what AI misses
            const titleStr = `${rawData.title || ''} ${refinedData.eligibility || ''} ${rawData.eligibility || ''}`;
            const yearMatches = titleStr.match(/\b(20[2-3]\d)\b/g);
            if (yearMatches) {
                const titleYears = [...new Set(yearMatches)];
                // Merge title years into batch (avoid duplicates)
                titleYears.forEach(y => {
                    if (!baseBatch.includes(y)) baseBatch.push(y);
                });
            }
            return baseBatch;
        })(),
        tags: cleanTags((rawData.tags && rawData.tags.length > 0) ? rawData.tags : (refinedData.tags || (rawData.role ? [rawData.role] : []))),
        jobType: mapJobType(refinedData.jobType || rawData.jobtype || (rawData.title?.toLowerCase().includes('intern') ? 'Internship' : 'FullTime')),
        
        roleType: cleanString(refinedData.roleType || rawData.roleType || rawData.role, 'Engineering'),
        seniority: cleanString(refinedData.seniority || rawData.seniority, 'Entry'),
        
        minSalary: refinedData.minSalary || parseMinSalary(refinedData.salary || rawData.pay || rawData.salary),
        isRemote: refinedData.isRemote || (String(refinedData.location || '').toLowerCase().includes('remote')) || (String(rawData.location || '').toLowerCase().includes('remote')) || false,
        rolesResponsibility: formatAiValue(refinedData.rolesResponsibility || rawData.rolesAndResponsibilities),
        requirements: formatAiValue(refinedData.requirements || rawData.requirements),
        niceToHave: formatAiValue(refinedData.niceToHave || rawData.niceToHave),
        companyInsights: formatAiValue(refinedData.companyInsights || ''),
        interviewTips: formatAiValue(refinedData.interviewTips || ''),
        isActive: true,
        isFeatured: false
    };
};

/**
 * Refines job data using AI (SEO Content Generation)
 */
const refineJobWithAI = async (jobData) => {
    try {
        console.log(`   🤖 Refining content for: ${jobData.company || 'Unknown'}`);
        const seoData = await generateSEOContent({
            title: jobData.title,
            company: jobData.company,
            location: jobData.location,
            salary: jobData.salary,
            batch: jobData.batch,
            description: jobData.description,
            role: jobData.roleType || jobData.role
        });

        if (seoData && seoData.error === 'rate_limit_exceeded') {
            return { error: 'rate_limit_exceeded' };
        }

        return seoData || null;
    } catch (err) {
        console.error('   ⚠️ AI Refinement failed:', err.message);
        return null;
    }
};

module.exports = {
    finalizeJobData,
    refineJobWithAI
};
