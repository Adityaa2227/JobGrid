const { scrapeJobPage } = require('../scraper');
const { parseJobWithAI } = require('../groq');
const { refineJobWithAI, finalizeJobData } = require('../jobProcessor');
const { downloadAndProcessLogo: downloadAndSaveLogo } = require('../../utils/imageProcessor');
const Job = require('../../models/Job');
const { postJobToTelegram } = require('./utils');
const sitemapService = require('../sitemapService');

/**
 * Extracts company name from common platform URLs for fallback
 */
const extractCompanyFromUrl = (url) => {
    try {
        const urlObj = new URL(url);
        const host = urlObj.hostname.toLowerCase();
        const pathParts = urlObj.pathname.split('/').filter(Boolean);

        if (host.includes('lever.co') && pathParts.length > 0) {
            return pathParts[0].charAt(0).toUpperCase() + pathParts[0].slice(1);
        }
        if (host.includes('greenhouse.io') && pathParts.length > 0) {
            return pathParts[0].charAt(0).toUpperCase() + pathParts[0].slice(1);
        }
    } catch (e) {}
    return null;
};

/**
 * Orchestrates the full job processing pipe: Scrape -> Parse -> Refine -> Save -> Post
 * @param {string} url - The job URL
 * @param {Object} bot - Telegraf bot instance
 * @param {Object} options - Optional: { content, title, company, applyUrl } for direct processing (e.g. RSS/JSON)
 */
const processJobUrl = async (url, bot, options = {}) => {
    try {
        let scraped = null;
        let fallbackUsed = false;

        // --- VERY EARLY URL-ONLY CHECK ---
        // Normalize URL for better matching
        const cleanUrl = url.toLowerCase().replace(/\/$/, '');
        const existingByUrl = await Job.findOne({ 
            $or: [
                { applyUrl: cleanUrl }, 
                { originalUrl: cleanUrl },
                { applyUrl: url },
                { originalUrl: url }
            ] 
        });
        
        if (existingByUrl) {
            console.log(`   ⏭️ Skipping Duplicate (URL Match): ${url}`);
            return { skipped: true, reason: 'duplicate' };
        }

        if (options.content || options.title) {
            // Already have content (from RSS/JSON), skip scraping
            scraped = {
                success: true,
                title: options.title || '',
                content: options.content || '',
                applyUrl: options.applyUrl || url,
                company: options.company || '',
                companyLogo: options.companyLogo || ''
            };
        } else {
            console.log(`   🔎 Scraping page: ${url}`);
            scraped = await scrapeJobPage(url);

            // Fallback for Specific Platforms (Lever, Greenhouse)
            // Fallback for Specific Platforms (Lever, Greenhouse)
            if (!scraped.success) {
                // Check if it failed because Puppeteer is required but skipped
                if (scraped.error === 'requires_puppeteer') {
                     // Proceed to queuing logic below (we'll move the check down or handle it here)
                     // Let's handle it here to keep flow clean
                     console.log(`   🚜 Queuing for Local Machine: ${url}`);
                     const queuedJob = new Job({
                        title: 'Pending Local Scrape',
                        company: 'Unknown',
                        applyUrl: url,
                        description: 'Waiting for local machine to scrape with Puppeteer.',
                        requiresPuppeteer: true,
                        aiStatus: 'pending',
                        location: 'Pending',
                        salary: 'Pending',
                        jobType: 'FullTime',
                        roleType: 'Engineering',
                        seniority: 'Entry',
                        isRemote: false,
                        batch: [],
                        tags: []
                    });
                    await queuedJob.save();
                    console.log(`✅ Saved Pending Job: ${queuedJob._id} [Requires Puppeteer]`);
                    return { success: true, jobId: queuedJob._id, status: 'queued_local' };
                }

                const isLever = url.includes('lever.co');
                const isGreenhouse = url.includes('greenhouse.io') || url.includes('greenhouse.com');

                if (isLever || isGreenhouse) {
                    console.log(`   ⚠️ Scraping failed, using fallback logic for ${isLever ? 'Lever' : 'Greenhouse'}...`);
                    const company = extractCompanyFromUrl(url) || (isLever ? 'Lever' : 'Greenhouse');
                    scraped = {
                        success: true,
                        title: `Job Opportunity at ${company}`,
                        company: company,
                        content: `A new job opening has been posted on ${isLever ? 'Lever' : 'Greenhouse'}. Visit the application link for more details.`,
                        applyUrl: url,
                        isFallback: true
                    };
                    fallbackUsed = true;
                } else {
                    return { success: false, error: scraped.error || 'Scraping failed' }; // Not a targeted platform, skip
                }
            }
        }

        // --- EARLY DEDUPLICATION CHECK ---
        // Check if job exists BEFORE doing expensive AI or image uploads
        const existing = await Job.findOne({
            $or: [
                { applyUrl: scraped.applyUrl || url },
                { 
                    title: { $regex: new RegExp(`^${scraped.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                    company: { $regex: new RegExp(`^${scraped.company ? scraped.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''}$`, 'i') }
                }
            ]
        });

        if (existing) {
             console.log(`   ⏭️ Skipping Duplicate (Early Check): ${scraped.title} at ${scraped.company || 'Unknown'}`);
             return { skipped: true, reason: 'duplicate' };
        }

        // Handle Hybrid Scraping (Puppeteer Skipped on Server)
        // Check if scraping failed because Puppeteer is required but skipped
        if (!scraped.success && scraped.error === 'requires_puppeteer') {
             console.log(`   🚜 Queuing for Local Machine: ${url}`);
             
             const queuedJob = new Job({
                title: 'Pending Local Scrape',
                company: 'Unknown',
                applyUrl: url,
                description: 'Waiting for local machine to scrape with Puppeteer.',
                requiresPuppeteer: true,
                aiStatus: 'pending', // Mark as pending so we know it's not done
                // Set defaults to satisfy schema
                location: 'Pending',
                salary: 'Pending',
                jobType: 'FullTime',
                roleType: 'Engineering',
                seniority: 'Entry',
                isRemote: false,
                batch: [],
                tags: []
            });
            
            await queuedJob.save();
            console.log(`✅ Saved Pending Job: ${queuedJob._id} [Requires Puppeteer]`);
            return { success: true, jobId: queuedJob._id, status: 'queued_local' };
        }

        // Limit content length to avoid token overflow (approx 3000 chars)
        const truncatedContent = scraped.content ? scraped.content.substring(0, 3000) : '';
        let enrichedText = `Job URL: ${url}\n\nTitle: ${scraped.title}\n${truncatedContent}`;
        
        let extractedData = await parseJobWithAI(enrichedText);
        let aiStatus = 'completed';
        
        // Handle AI Rate Limit - Save for later instead of erroring
        if (extractedData && extractedData.error === 'rate_limit_exceeded') {
            console.log(`   ⚠️ Rate Limit Hit. Queuing job for later: ${scraped.title}`);
            const titleCompMatch = scraped.title ? scraped.title.match(/^([^|]+?)\s+(?:Off Campus|Hiring|Recruitment|Drive|Careers|Internship|Jobs|Job)/i) : null;
            const fallbackComp = (scraped.company && scraped.company !== 'Unknown')
                ? scraped.company
                : (titleCompMatch && titleCompMatch[1] ? titleCompMatch[1].replace(/^(?:Direct|Urgent|Latest|New)\s+/i, '').trim() : 'Unknown');

            const titleLocMatch = scraped.title ? scraped.title.match(/\|\s*([^|]+)$/) : null;
            const fallbackLoc = scraped.location || (titleLocMatch && titleLocMatch[1] ? titleLocMatch[1].trim() : 'Remote');

            const titleBatchMatches = scraped.title ? scraped.title.match(/\b(202[0-9]|203[0-9])\b/g) : null;
            const fallbackBatch = (scraped.batch && scraped.batch.length > 0) ? scraped.batch : (titleBatchMatches ? Array.from(new Set(titleBatchMatches)) : []);

            extractedData = {
                title: scraped.title,
                company: fallbackComp,
                location: fallbackLoc,
                salary: scraped.salary || 'Competitive',
                applyUrl: scraped.applyUrl || url,
                description: scraped.content, // Save full content in description for now
                jobType: 'FullTime',
                roleType: 'Engineering',
                seniority: 'Entry',
                isRemote: fallbackLoc.toLowerCase().includes('remote'),
                batch: fallbackBatch,
                tags: scraped.tags || []
            };
        } else if (!extractedData) {
            // Handle Parsing Error (JSON validation failed or other)
            console.log(`   ⚠️ AI Parsing Failed. Queuing job for later retry: ${scraped.title}`);
            aiStatus = 'failed';

            const titleCompMatch = scraped.title ? scraped.title.match(/^([^|]+?)\s+(?:Off Campus|Hiring|Recruitment|Drive|Careers|Internship|Jobs|Job)/i) : null;
            const fallbackComp = (scraped.company && scraped.company !== 'Unknown')
                ? scraped.company
                : (titleCompMatch && titleCompMatch[1] ? titleCompMatch[1].replace(/^(?:Direct|Urgent|Latest|New)\s+/i, '').trim() : 'Unknown');

            const titleLocMatch = scraped.title ? scraped.title.match(/\|\s*([^|]+)$/) : null;
            const fallbackLoc = scraped.location || (titleLocMatch && titleLocMatch[1] ? titleLocMatch[1].trim() : 'Remote');

            const titleBatchMatches = scraped.title ? scraped.title.match(/\b(202[0-9]|203[0-9])\b/g) : null;
            const fallbackBatch = (scraped.batch && scraped.batch.length > 0) ? scraped.batch : (titleBatchMatches ? Array.from(new Set(titleBatchMatches)) : []);

            extractedData = {
                title: scraped.title,
                company: fallbackComp,
                location: fallbackLoc,
                salary: scraped.salary || 'Competitive',
                applyUrl: scraped.applyUrl || url,
                description: scraped.content,
                jobType: 'FullTime',
                roleType: 'Engineering',
                seniority: 'Entry',
                isRemote: fallbackLoc.toLowerCase().includes('remote'),
                batch: fallbackBatch,
                tags: scraped.tags || []
            };
        }

        // Only refine if we actually got data from AI
        let refinedData = {};
        if (aiStatus === 'completed') {
             refinedData = await refineJobWithAI(extractedData);
             if (refinedData && refinedData.error === 'rate_limit_exceeded') {
                 console.log(`   ⚠️ Rate Limit Hit during refinement. Queuing job.`);
                 aiStatus = 'rate_limited';
             }
        }

        const isExternalSaaS = (link) => {
            if (!link) return false;
            const l = link.toLowerCase();
            return l.includes('lever.co') || 
                   l.includes('greenhouse.io') || 
                   l.includes('workday') || 
                   l.includes('oraclecloud.com') || 
                   l.includes('smartrecruiters.com') || 
                   l.includes('jobs.ashbyhq.com') ||
                   l.includes('apply');
        };

        // Determine the best apply URL
        let finalApplyUrl = url; // Default to original
        
        // If we found a scraped link, check if it's "better" or if original is just a hub
        const scrapedApply = scraped.applyUrl || extractedData.applyUrl;
        if (scrapedApply) {
            const isOriginalHub = url.includes('talentd.in') || url.includes('fresher') || url.includes('.blog');
            const isScrapedExternal = isExternalSaaS(scrapedApply);
            
            if (isScrapedExternal || isOriginalHub) {
                finalApplyUrl = scrapedApply;
            }
        }

        const rawData = {
            ...extractedData,
            applyUrl: finalApplyUrl,
            companyLogo: scraped.companyLogo || extractedData.companyLogo,
            company: scraped.company || extractedData.company,
            tags: scraped.tags || extractedData.tags,
            batch: scraped.batch || extractedData.batch
        };

        const jobData = await finalizeJobData(refinedData || {}, rawData);
        
        jobData.aiStatus = aiStatus;
        if (aiStatus === 'rate_limited') {
            jobData.rawContent = `Job URL: ${url}\n\nTitle: ${scraped.title}\n${scraped.content}`;
        }

        // Sanity checks/cleanup: Avoid circular links where the apply button just points back to the listing
        if (jobData.applyUrl && jobData.applyUrl.toLowerCase().includes('talentd.in')) {
            // Only skip if it's not a direct apply link or if it matches the current job page
            const isListingOnly = !jobData.applyUrl.includes('/apply') || jobData.applyUrl.toLowerCase().replace(/\/$/, '') === url.toLowerCase().replace(/\/$/, '');
            
            if (isListingOnly) {
                console.log(`   ⏭️ Skipping Circular Link: ${jobData.title} (${jobData.applyUrl})`);
                return { skipped: true, reason: 'circular' };
            }
        }

        if (jobData.companyLogo && jobData.companyLogo.includes('talentd-orange-icon.avif')) jobData.companyLogo = '';
        
        // Download logo if needed
        if (jobData.companyLogo && jobData.companyLogo.startsWith('http') && !jobData.companyLogo.includes('res.cloudinary.com')) {
             const localLogo = await downloadAndSaveLogo(jobData.companyLogo, jobData.company);
             if (localLogo) jobData.companyLogo = localLogo;
        }

        const newJob = new Job(jobData);
        await newJob.save();
        console.log(`✅ Saved: ${newJob.title} [Status: ${aiStatus}]`);
        if (aiStatus === 'completed') {
            console.log(`🔗 Apply Link: ${newJob.applyUrl}`);
            
            // Trigger native app notifications only for completed jobs
            const { triggerJobNotifications } = require('../notificationService');
            triggerJobNotifications(newJob).catch(e => console.error('Push Trigger Error:', e));

            // Trigger search engine notifications (Sitemap / Indexing)
            sitemapService.notifyNewJob(newJob).catch(e => console.error('Sitemap Notification Error:', e));

            const msgId = await postJobToTelegram(newJob, bot);
            if (msgId) {
                newJob.telegramMessageId = msgId;
                await newJob.save();
            }

            // Add to WhatsApp Bundle if requested & completed
            if (options.bundler) {
                await options.bundler.addJob(newJob);
            }
        } else {
            console.log(`⏳ Job queued for AI processing later.`);
        }

        return { success: true, jobId: newJob._id };

    } catch (err) {
        console.error(`   ❌ Error processing URL ${url}: ${err.message}`);
        return { success: false, error: err.message };
    }
};

module.exports = { processJobUrl };
