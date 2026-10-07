const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const Job = require('../models/Job');
const { generateSEOContent } = require('../services/groq');

async function reSyncRecentJobs(limit = 2) {
    try {
        console.log('⏳ Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected.');

        console.log(`\n🔎 Fetching the ${limit} most recent jobs...`);
        const jobs = await Job.find().sort({ createdAt: -1 }).limit(limit);

        if (jobs.length === 0) {
            console.log('❌ No jobs found.');
            return;
        }

        for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i];
            console.log(`\n[${i + 1}/${jobs.length}] 🔄 Re-syncing: ${job.title} at ${job.company}`);
            
            // Prepare data for AI
            const jobData = {
                title: job.title,
                company: job.company,
                role: job.roleType,
                location: job.location,
                salary: job.salary,
                batch: job.batch?.join(', '),
                description: job.description + '\n' + (job.rolesResponsibility || '') + '\n' + (job.requirements || '')
            };

            console.log('🤖 Calling AI for fresh insights...');
            const refined = await generateSEOContent(jobData);

            if (refined && !refined.error) {
                job.companyInsights = refined.companyInsights || '';
                job.interviewTips = refined.interviewTips || '';
                
                // Also update other SEO fields just in case
                if (refined.rolesResponsibility) job.rolesResponsibility = Array.isArray(refined.rolesResponsibility) ? refined.rolesResponsibility.join('\n') : refined.rolesResponsibility;
                if (refined.requirements) job.requirements = Array.isArray(refined.requirements) ? refined.requirements.join('\n') : refined.requirements;
                
                await job.save();
                console.log('✅ Updated successfully with unique insights.');
            } else {
                console.log('❌ AI Refinement failed or rate limited.');
                if (refined?.error === 'rate_limit_exceeded') {
                    console.log('🛑 Rate limit reached. Stopping.');
                    break;
                }
            }
        }

        console.log('\n✨ Re-sync complete.');
        process.exit(0);

    } catch (err) {
        console.error('\n❌ Error:', err.message);
        process.exit(1);
    }
}

const limitArg = parseInt(process.argv[2]) || 20;
reSyncRecentJobs(limitArg);
