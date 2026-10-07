const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const Job = require('../src/models/Job');
const { parseJobWithAI } = require('../src/services/groq');

async function run() {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    const jobs = await Job.find({
        $or: [
            { company: 'Unknown' },
            { company: '' },
            { aiStatus: 'failed' },
            { location: '' },
            { location: 'Not specified' }
        ]
    });

    console.log(`Found ${jobs.length} jobs to inspect and repair...`);

    let repaired = 0;
    for (const job of jobs) {
        console.log(`\n--- Inspecting: "${job.title}" ---`);
        console.log(`Current: Company=${job.company}, Location=${job.location}, Salary=${job.salary}, Batch=${job.batch}`);

        // 1. Company extraction
        let comp = job.company && job.company !== 'Unknown' ? job.company : '';
        if (!comp) {
            const compMatch = job.title.match(/^([^|]+?)\s+(?:Off Campus|Hiring|Recruitment|Drive|Careers|Internship|Jobs|Job)/i);
            if (compMatch && compMatch[1]) {
                comp = compMatch[1].replace(/^(?:Direct|Urgent|Latest|New)\s+/i, '').trim();
            }
        }

        // 2. Location extraction
        let loc = job.location && !['Pending AI', 'Pending', 'Not specified', ''].includes(job.location) ? job.location : '';
        if (!loc) {
            const locMatch = job.title.match(/\|\s*([^|]+)$/);
            if (locMatch && locMatch[1]) loc = locMatch[1].trim();
        }

        // 3. Batch extraction
        let batch = job.batch && job.batch.length > 0 ? job.batch : [];
        if (batch.length === 0) {
            const batchMatches = job.title.match(/\b(202[0-9]|203[0-9])\b/g);
            if (batchMatches) batch = Array.from(new Set(batchMatches));
        }

        // 4. Clean description
        let cleanDesc = job.description || '';
        cleanDesc = cleanDesc.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        cleanDesc = cleanDesc.replace(/<p[^>]*>(?:<strong>)?(?:Instant Job Updates|Join our Official|Join Official|Official WhatsApp|Official Telegram|Official Instagram|Apply Link\s*:|How To Apply)[^<]*(?:<a[^>]*>[^<]*<\/a>)?[^<]*<\/p>/gi, '');
        cleanDesc = cleanDesc.replace(/(?:Instant Job Updates|Join our Official WhatsApp|Join our Official Telegram|Join our Official Instagram|Apply Link\s*:|How To Apply)[^\n]+/gi, '');
        cleanDesc = cleanDesc.replace(/<figure[^>]*>.*?<\/figure>/gis, '');
        cleanDesc = cleanDesc.replace(/<p[^>]*>\s*<\/p>/gi, '').trim();

        // 5. AI re-parse for rich attributes
        try {
            const snippet = `Title: ${job.title}\nCompany: ${comp || 'Unknown'}\nLocation: ${loc || 'Remote'}\n${cleanDesc.substring(0, 2000)}`;
            const aiData = await parseJobWithAI(snippet);
            if (aiData && !aiData.error) {
                if (aiData.company && aiData.company !== 'Unknown') comp = aiData.company;
                if (aiData.location && !loc) loc = aiData.location;
                if (aiData.salary && (!job.salary || job.salary === 'Pending' || job.salary === 'Competitive')) {
                    job.salary = aiData.salary;
                }
                if (aiData.eligibility && !job.eligibility) job.eligibility = aiData.eligibility;
                if (aiData.rolesResponsibility && Array.isArray(aiData.rolesResponsibility)) {
                    job.rolesResponsibility = aiData.rolesResponsibility.join('\n');
                }
                if (aiData.requirements && Array.isArray(aiData.requirements)) {
                    job.requirements = aiData.requirements.join('\n');
                }
                if (aiData.tags && Array.isArray(aiData.tags) && aiData.tags.length > 0) {
                    job.tags = aiData.tags;
                }
                if (aiData.batch && Array.isArray(aiData.batch) && aiData.batch.length > 0) {
                    batch = Array.from(new Set([...batch, ...aiData.batch]));
                }
                job.aiStatus = 'completed';
            }
        } catch (e) {
            console.warn('AI parse skipped:', e.message);
        }

        job.company = comp || 'JobGrid Partner';
        job.location = loc || 'Remote';
        if (!job.salary || job.salary === 'Pending') job.salary = 'Competitive';
        job.batch = batch;
        job.description = cleanDesc;
        if (job.location.toLowerCase().includes('remote')) job.isRemote = true;

        await job.save();
        console.log(`✅ Repaired -> Company: "${job.company}", Location: "${job.location}", Batch: [${job.batch.join(', ')}]`);
        repaired++;
    }

    console.log(`\n🎉 Successfully repaired ${repaired} jobs in database!`);
    await mongoose.disconnect();
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
