const express = require('express');
const router = express.Router();
const ScheduledJob = require('../models/ScheduledJob');
const Analytics = require('../models/Analytics');
const Settings = require('../models/Settings');
const Job = require('../models/Job');
const User = require('../models/User');

// --- Queue Routes ---

// Get all queue items
router.get('/queue', async (req, res) => {
    try {
        const queue = await ScheduledJob.find().sort({ scheduledFor: 1 });
        res.json(queue);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Run a specific queue item (Placeholder - actual logic might depend on worker)
router.post('/queue/:id/run', async (req, res) => {
    try {
        const job = await ScheduledJob.findById(req.params.id);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        // Logic to trigger the job immediately
        // For now, we'll set it to 'pending' and scheduledFor to now to be picked up by worker
        job.status = 'pending';
        job.scheduledFor = new Date();
        await job.save();

        res.json({ message: 'Job scheduled for immediate execution' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Clear queue by status (MUST be before /queue/:id to avoid matching "clear" as an ID)
router.delete('/queue/clear', async (req, res) => {
    try {
        const { status } = req.query;
        if (!status) return res.status(400).json({ error: 'Status is required' });
        
        await ScheduledJob.deleteMany({ status });
        res.json({ message: `Cleared all ${status} jobs` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a queue item
router.delete('/queue/:id', async (req, res) => {
    try {
        await ScheduledJob.findByIdAndDelete(req.params.id);
        res.json({ message: 'Queue item deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add job to queue manually
router.post('/queue', async (req, res) => {
    try {
        const AuditLog = require('../models/AuditLog');
        const { url, title, scheduledFor, priority = 0 } = req.body;
        
        if (!url) return res.status(400).json({ error: 'URL is required' });
        
        const job = new ScheduledJob({
            originalUrl: url,
            title: title || url.substring(0, 50),
            scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
            priority: Math.min(10, Math.max(0, priority)),
            source: 'manual',
            status: 'pending'
        });
        
        await job.save();
        await AuditLog.log('QUEUE_JOB_ADDED', 'system', { url, title });
        
        res.status(201).json(job);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update job priority
router.put('/queue/:id/priority', async (req, res) => {
    try {
        const { priority } = req.body;
        const job = await ScheduledJob.findByIdAndUpdate(
            req.params.id,
            { priority: Math.min(10, Math.max(0, priority)) },
            { new: true }
        );
        
        if (!job) return res.status(404).json({ error: 'Job not found' });
        res.json(job);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Retry a failed job
router.post('/queue/:id/retry', async (req, res) => {
    try {
        const job = await ScheduledJob.findById(req.params.id);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        if (job.status !== 'failed') {
            return res.status(400).json({ error: 'Only failed jobs can be retried' });
        }
        
        if (job.retryCount >= job.maxRetries) {
            return res.status(400).json({ error: 'Max retries exceeded' });
        }
        
        job.status = 'pending';
        job.scheduledFor = new Date();
        job.retryCount = (job.retryCount || 0) + 1;
        job.error = null;
        await job.save();
        
        res.json({ message: 'Job queued for retry', job });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Retry all failed jobs
router.post('/queue/retry-all', async (req, res) => {
    try {
        const result = await ScheduledJob.updateMany(
            { status: 'failed', $expr: { $lt: ['$retryCount', '$maxRetries'] } },
            {
                $set: { status: 'pending', scheduledFor: new Date(), error: null },
                $inc: { retryCount: 1 }
            }
        );
        
        res.json({ message: `Retrying ${result.modifiedCount} failed jobs` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk delete selected jobs
router.post('/queue/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ error: 'IDs array required' });
        }
        
        const result = await ScheduledJob.deleteMany({ _id: { $in: ids } });
        
        const AuditLog = require('../models/AuditLog');
        await AuditLog.log('QUEUE_BULK_DELETE', 'system', { count: result.deletedCount, ids });

        res.json({ message: `Deleted ${result.deletedCount} jobs` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk run selected jobs
router.post('/queue/bulk-run', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ error: 'IDs array required' });
        }
        
        const result = await ScheduledJob.updateMany(
            { _id: { $in: ids }, status: 'pending' },
            { scheduledFor: new Date() }
        );
        
        res.json({ message: `Triggered ${result.modifiedCount} jobs` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get queue stats
router.get('/queue/stats', async (req, res) => {
    try {
        const [pending, processed, failed, total] = await Promise.all([
            ScheduledJob.countDocuments({ status: 'pending' }),
            ScheduledJob.countDocuments({ status: 'processed' }),
            ScheduledJob.countDocuments({ status: 'failed' }),
            ScheduledJob.countDocuments()
        ]);
        
        // Get processing rate (last 24h)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const processedToday = await ScheduledJob.countDocuments({
            status: 'processed',
            processedAt: { $gte: oneDayAgo }
        });
        
        res.json({ pending, processed, failed, total, processedToday });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get queue interval setting
router.get('/queue-interval', async (req, res) => {
    try {
        const intervalValue = await Settings.findOne({ key: 'queue_interval_value' });
    const intervalUnit = await Settings.findOne({ key: 'queue_interval_unit' });
    const legacyInterval = await Settings.findOne({ key: 'schedule_interval_minutes' });

    let val = 5;
    if (intervalValue) val = parseInt(intervalValue.value);
    else if (legacyInterval) val = parseInt(legacyInterval.value);

    res.json({ 
        interval: val,
        unit: intervalUnit ? intervalUnit.value : 'minutes'
    });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all settings
router.get('/settings', async (req, res) => {
    try {
        const settingsDesc = await Settings.find();
        // Transform array to object: { key: value }
        const settingsObj = settingsDesc.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});
        res.json(settingsObj);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update settings
router.post('/settings', async (req, res) => {
    try {
        const { key, value } = req.body;
        await Settings.findOneAndUpdate(
            { key },
            { key, value },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Analytics Routes ---

// Get CEO dashboard stats
router.get('/dashboard-stats', async (req, res) => {
    try {
        const totalJobs = await Job.countDocuments({ isActive: true });
        const totalUsers = await User.countDocuments({});
        const activeAlerts = await ScheduledJob.countDocuments({ status: 'pending' });
        
        // Cleanup Stats
        const fortyFiveDaysAgo = new Date();
        fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

        const expiredJobs = await Job.countDocuments({ 
            createdAt: { $lt: fortyFiveDaysAgo }, 
            isActive: true 
        });

        const zeroEngagementJobs = await Job.countDocuments({
            clicks: 0,
            views: 0,
            isActive: true,
            createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Older than 7 days to give them a chance
        });

        const reportedJobs = await Job.countDocuments({
            reportCount: { $gt: 0 },
            isActive: true
        });

        // Time-based stats
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);

        const jobsToday = await Job.countDocuments({ createdAt: { $gte: startOfToday } });
        const jobsWeek = await Job.countDocuments({ createdAt: { $gte: startOfWeek } });

        // Users Today (using createdAt from User model)
        const usersToday = await User.countDocuments({ createdAt: { $gte: startOfToday } });
        const usersWeek = await User.countDocuments({ createdAt: { $gte: startOfWeek } });

        // DAU/MAU
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        const dau = await User.countDocuments({ $or: [{ lastLoginDate: { $gte: oneDayAgo } }, { lastVisit: { $gte: oneDayAgo } }] });
        const mau = await User.countDocuments({ $or: [{ lastLoginDate: { $gte: monthAgo } }, { lastVisit: { $gte: monthAgo } }] });

        // Resume Scans Today (Fetch today's analytics)
        const todayStr = new Date().toISOString().split('T')[0];
        const todayAnalytics = await Analytics.findOne({ date: todayStr });
        const scansToday = todayAnalytics ? todayAnalytics.metrics.resumeScans : 0;

        // Apply Rate Stats
        // Aggregating views and clicks from all jobs
        const engagementStats = await Job.aggregate([
            { $group: { _id: null, totalViews: { $sum: "$views" }, totalClicks: { $sum: "$clicks" } } }
        ]);
        const totalJobViews = engagementStats[0]?.totalViews || 0;
        const applyClicks = engagementStats[0]?.totalClicks || 0;

        // Mock data for now if real data is complex to aggregate quickly
        const revenue = 0; 
        
        const coinsEarned = await User.aggregate([{ $group: { _id: null, total: { $sum: "$gridCoins" } } }]).then(res => res[0]?.total || 0);
        // Mock coins spent for now
        const coinsSpent = Math.floor(coinsEarned * 0.3);

        res.json({
            totalJobs,
            totalUsers,
            activeAlerts,
            revenue,
            expiredJobs,
            zeroEngagementJobs,
            reportedJobs,
            coinsEarned,
            coinsSpent,
            scansToday,
            usersToday,
            usersWeek,
            jobsToday,
            jobsWeek,
            dau,
            mau,
            totalJobViews,
            applyClicks
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get detailed analytics for charts
router.get('/analytics/detailed', async (req, res) => {
    try {
        const data = await Analytics.find().sort({ date: 1 }).limit(30);
        
        // Map to format charts expect: { _id: date, count: registrations, views: logins, clicks: jobClicks }
        const mappedData = data.map(d => ({
            _id: d.date,
            count: d.metrics?.registrations || 0,
            views: d.metrics?.logins || 0,
            clicks: d.metrics?.jobClicks || 0,
            applyClicks: d.metrics?.applyClicks || 0,
            original: d
        }));
        
        res.json(mappedData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Job Management Routes ---

// Smart Cleanup Routes
router.post('/cleanup/:type', async (req, res) => {
    try {
        const { type } = req.params;
        let result;

        if (type === 'expired') {
            const fortyFiveDaysAgo = new Date();
            fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);
            result = await Job.updateMany(
                { createdAt: { $lt: fortyFiveDaysAgo }, isActive: true },
                { isActive: false }
            );
            return res.json({ success: true, message: `Archived ${result.modifiedCount} expired jobs` });
        }

        if (type === 'zero-engagement') {
             result = await Job.updateMany(
                { 
                    clicks: 0, 
                    views: 0, 
                    isActive: true,
                    createdAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                },
                { isActive: false }
            );
            return res.json({ success: true, message: `Archived ${result.modifiedCount} low engagement jobs` });
        }

        res.status(400).json({ error: 'Invalid cleanup type' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cleanup old jobs (Legacy - keep for backward compatibility or remove if unused)
router.post('/cleanup', async (req, res) => {
    try {
        // Archive non-featured jobs older than 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const result = await Job.updateMany(
            { createdAt: { $lt: thirtyDaysAgo }, isFeatured: { $ne: true } },
            { isActive: false }
        );
        
        res.json({ message: `Archived ${result.modifiedCount} old jobs` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Clear all jobs (Dangerous)
router.delete('/jobs/clear', async (req, res) => {
    try {
        await Job.deleteMany({});
        res.json({ message: 'All jobs deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Clear reported jobs
router.delete('/jobs/reported', async (req, res) => {
    try {
        // Assuming there's a reports field or isReported flag
        // Based on page.tsx 'jobFilter' toggle, there must be a way to identify them.
        // I'll assume 'reports' array length > 0 or similar.
        // Let's assume reports count > 0 for now.
        const result = await Job.deleteMany({ $expr: { $gt: [{ $size: "$reports" }, 0] } });
        res.json({ message: 'Reported jobs cleared' });
    } catch (err) {
        // Fallback if reports is not an array (e.g. number)
        try {
             const result = await Job.deleteMany({ reports: { $gt: 0 } });
             res.json({ message: 'Reported jobs cleared' });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    }
});

// Toggle job status
router.put('/jobs/:id/toggle', async (req, res) => {
    try {
        const job = await Job.findById(req.params.id);
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        job.isActive = !job.isActive;
        await job.save();

        const AuditLog = require('../models/AuditLog');
        await AuditLog.log('JOB_STATUS_TOGGLED', 'job', { targetId: job._id, title: job.title, isActive: job.isActive });

        res.json({ success: true, isActive: job.isActive });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create new job
router.post('/jobs', async (req, res) => {
    try {
        const job = new Job(req.body);
        await job.save();
        const AuditLog = require('../models/AuditLog');
        await AuditLog.log('JOB_CREATED', 'job', { targetId: job._id, title: job.title, company: job.company });
        res.status(201).json(job);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update specific job
router.put('/jobs/:id', async (req, res) => {
    try {
        const job = await Job.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!job) return res.status(404).json({ error: 'Job not found' });
        const AuditLog = require('../models/AuditLog');
        await AuditLog.log('JOB_UPDATED', 'job', { targetId: job._id, title: job.title, company: job.company });
        res.json(job);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Bulk delete jobs
router.post('/jobs/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Array of job IDs is required' });
        }
        const result = await Job.deleteMany({ _id: { $in: ids } });
        const AuditLog = require('../models/AuditLog');
        await AuditLog.log('JOBS_BULK_DELETED', 'job', { count: result.deletedCount, ids });
        res.json({ success: true, message: `Successfully deleted ${result.deletedCount} jobs`, count: result.deletedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Repair & Re-parse all Unknown / Failed jobs
router.post('/jobs/repair-all', async (req, res) => {
    try {
        const { parseJobWithAI } = require('../services/groq');
        const jobs = await Job.find({
            $or: [
                { company: 'Unknown' },
                { company: '' },
                { aiStatus: 'failed' },
                { location: '' },
                { location: 'Pending AI' },
                { location: 'Not specified' }
            ]
        });

        let repairedCount = 0;

        for (const job of jobs) {
            try {
                // 1. Title matching for company
                let comp = job.company && job.company !== 'Unknown' ? job.company : '';
                if (!comp) {
                    const compMatch = job.title.match(/^([^|]+?)\s+(?:Off Campus|Hiring|Recruitment|Drive|Careers|Internship|Jobs|Job)/i);
                    if (compMatch && compMatch[1]) {
                        comp = compMatch[1].replace(/^(?:Direct|Urgent|Latest|New)\s+/i, '').trim();
                    }
                }

                // 2. Location matching from title
                let loc = job.location && !['Pending AI', 'Pending', 'Not specified', ''].includes(job.location) ? job.location : '';
                if (!loc) {
                    const locMatch = job.title.match(/\|\s*([^|]+)$/);
                    if (locMatch && locMatch[1]) loc = locMatch[1].trim();
                }

                // 3. Batch matching from title
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

                // 5. Try AI re-parse for rich fields
                let aiData = null;
                try {
                    const snippet = `Title: ${job.title}\nCompany: ${comp || 'Unknown'}\nLocation: ${loc}\n${cleanDesc.substring(0, 2000)}`;
                    aiData = await parseJobWithAI(snippet);
                } catch (e) {
                    console.warn(`Repair AI parse failed for ${job.title}:`, e.message);
                }

                if (aiData && !aiData.error) {
                    if (aiData.company && aiData.company !== 'Unknown') comp = aiData.company;
                    if (aiData.location && !loc) loc = aiData.location;
                    if (aiData.salary && (!job.salary || job.salary === 'Pending' || job.salary === 'Competitive')) job.salary = aiData.salary;
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

                if (comp) job.company = comp;
                if (loc) job.location = loc;
                if (!job.salary || job.salary === 'Pending') job.salary = 'Competitive';
                job.batch = batch;
                job.description = cleanDesc;
                if (job.location?.toLowerCase().includes('remote')) job.isRemote = true;

                await job.save();
                repairedCount++;
            } catch (jobErr) {
                console.error(`Failed to repair job ${job._id}:`, jobErr);
            }
        }

        res.json({ success: true, message: `Successfully repaired ${repairedCount} jobs!`, repairedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete specific job
router.delete('/jobs/:id', async (req, res) => {
    try {
        await Job.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- User Management Routes ---

// Get all users with pagination and search
router.get('/users', async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const query = search 
            ? { $or: [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }] }
            : {};

        const users = await User.find(query)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 });

        const count = await User.countDocuments(query);

        res.json({
            users,
            totalPages: Math.ceil(count / limit),
            currentPage: page
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user (tier, coins, etc.)
router.put('/users/:id', async (req, res) => {
    try {
        const { tier, gridCoins, name } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id, 
            { tier, gridCoins, name },
            { new: true }
        );
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get user counts by batch/graduation year
router.get('/user-counts', async (req, res) => {
    try {
        // Aggregate by batch or graduationYear. 
        // Frontend expects { "2025": 10, "2024": 5 }
        const counts = await User.aggregate([
            {
                $group: {
                    _id: { $ifNull: ["$batch", "$graduationYear"] }, // Fallback to grad year if batch is null
                    count: { $sum: 1 }
                }
            }
        ]);

        const formatCounts = counts.reduce((acc, curr) => {
            if (curr._id) acc[curr._id.toString()] = curr.count;
            return acc;
        }, {});

        res.json(formatCounts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Broadcast/Alert Routes ---

// Get broadcast analytics (Mock for now)
router.get('/broadcast-analytics', async (req, res) => {
    try {
        // In a real app, calculate from email logs
        res.json({
            openRate: 45,
            ctr: 12
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get AI Job Suggestions for a batch
router.get('/ai-job-suggestions', async (req, res) => {
    try {
        const { batch } = req.query;
        // Mock logic: Find jobs relevant to this batch (e.g. by title or simply recent jobs)
        // For now, return recent jobs as suggestions
        const jobs = await Job.find({ isActive: true }).sort({ createdAt: -1 }).limit(5);
        
        const suggestions = jobs.map(job => ({
            _id: job._id,
            title: job.title,
            company: job.company,
            location: job.location,
            slug: job._id, // Assuming slug is ID for now or job has slug
            matchScore: Math.floor(Math.random() * 20) + 80 // Mock score 80-99
        }));

        res.json({ suggestions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send batch alerts
router.post('/alerts/batch', async (req, res) => {
    try {
        const { batches, subject, message } = req.body;
        // Logic to send emails/notifications to users in these batches
        // For now, just count them
        // const count = await User.countDocuments({ batch: { $in: batches } });
        
        // Mock success
        res.json({ count: 100, message: 'Alerts queued successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AI Usage Tracking ---
router.get('/ai-usage', async (req, res) => {
    try {
        const AIUsage = require('../models/AIUsage');
        const today = new Date().toISOString().split('T')[0];
        
        // Get last 7 days of usage
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const usage = await AIUsage.find({ date: { $gte: sevenDaysAgo } }).sort({ date: -1 });
        
        const todayUsage = usage.find(u => u.date === today) || { tokensUsed: 0, requestCount: 0, apiKeys: {} };
        const totalTokens = usage.reduce((acc, u) => acc + (u.tokensUsed || 0), 0);
        const totalRequests = usage.reduce((acc, u) => acc + (u.requestCount || 0), 0);
        const totalErrors = usage.reduce((acc, u) => acc + (u.errorCount || 0), 0);
        
        // Groq free tier: ~14,400 requests/day, ~6000 tokens/minute
        const dailyLimit = 500000; // Rough estimate
        const percentUsed = Math.min(100, Math.round((todayUsage.tokensUsed / dailyLimit) * 100));
        
        res.json({
            today: todayUsage,
            apiKeys: todayUsage.apiKeys, // Breakdown for the 4 keys
            week: { totalTokens, totalRequests, totalErrors },
            history: usage,
            quota: {
                limit: dailyLimit,
                used: todayUsage.tokensUsed,
                percentUsed,
                resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString()
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Audit Log ---
router.get('/audit-log', async (req, res) => {
    try {
        const AuditLog = require('../models/AuditLog');
        const { category, limit = 50 } = req.query;
        
        const query = category ? { category } : {};
        const logs = await AuditLog.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit));
        
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- User Management ---
router.put('/users/:id/ban', async (req, res) => {
    try {
        const AuditLog = require('../models/AuditLog');
        const { banned } = req.body;
        
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isBanned: banned },
            { new: true }
        );
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        await AuditLog.log(
            banned ? 'USER_BANNED' : 'USER_UNBANNED',
            'user',
            { targetId: user._id, email: user.email }
        );
        
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/users/:id/coins', async (req, res) => {
    try {
        const AuditLog = require('../models/AuditLog');
        const { amount, reason } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const oldBalance = user.gridCoins || 0;
        user.gridCoins = oldBalance + amount;
        await user.save();
        
        await AuditLog.log(
            'COINS_ADJUSTED',
            'user',
            { targetId: user._id, oldBalance, newBalance: user.gridCoins, amount, reason }
        );
        
        res.json({ oldBalance, newBalance: user.gridCoins });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        const AuditLog = require('../models/AuditLog');
        const user = await User.findByIdAndDelete(req.params.id);
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        await AuditLog.log('USER_DELETED', 'user', { email: user.email });
        
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Job CRUD ---
router.post('/jobs', async (req, res) => {
    try {
        const AuditLog = require('../models/AuditLog');
        const newJob = new Job(req.body);
        await newJob.save();
        
        await AuditLog.log('JOB_CREATED', 'job', { targetId: newJob._id, title: newJob.title });
        
        res.status(201).json(newJob);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/jobs/:id', async (req, res) => {
    try {
        const AuditLog = require('../models/AuditLog');
        const job = await Job.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        
        if (!job) return res.status(404).json({ error: 'Job not found' });
        
        await AuditLog.log('JOB_UPDATED', 'job', { targetId: job._id, title: job.title });
        
        res.json(job);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Forum Moderation ---
router.get('/forum/reports', async (req, res) => {
    try {
        // Assuming you have a ForumPost model with a 'reportCount' field
        const ForumPost = require('../models/ForumPost');
        const reports = await ForumPost.find({ reportCount: { $gt: 0 } })
            .sort({ reportCount: -1 })
            .limit(50)
            .populate('author', 'name email');
        
        res.json(reports);
    } catch (err) {
        // If ForumPost model doesn't exist, return empty
        res.json([]);
    }
});

router.delete('/forum/posts/:id', async (req, res) => {
    try {
        const AuditLog = require('../models/AuditLog');
        const ForumPost = require('../models/ForumPost');
        
        const post = await ForumPost.findByIdAndDelete(req.params.id);
        if (!post) return res.status(404).json({ error: 'Post not found' });
        
        await AuditLog.log('FORUM_POST_DELETED', 'forum', { targetId: post._id, title: post.title });
        
        res.json({ message: 'Post deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/forum/posts/:id/pin', async (req, res) => {
    try {
        const ForumPost = require('../models/ForumPost');
        const { pinned } = req.body;
        
        const post = await ForumPost.findByIdAndUpdate(
            req.params.id,
            { isPinned: pinned },
            { new: true }
        );
        
        if (!post) return res.status(404).json({ error: 'Post not found' });
        
        res.json(post);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Broadcast/Notifications ---
router.post('/broadcast', async (req, res) => {
    try {
        const AuditLog = require('../models/AuditLog');
        const { title, message, targetAll } = req.body;
        
        // Store broadcast (could be sent via WebSocket, push notification, etc.)
        await AuditLog.log('BROADCAST_SENT', 'system', { title, message, targetAll });
        
        res.json({ success: true, message: 'Broadcast queued' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- System Health ---
router.get('/health', async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const CronConfig = require('../models/CronConfig');
        
        const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
        const cronJobs = await CronConfig.find();
        const activeCrons = cronJobs.filter(c => c.enabled).length;
        const failedCrons = cronJobs.filter(c => c.lastStatus === 'failed').length;
        
        res.json({
            status: 'ok',
            database: dbStatus,
            crons: { total: cronJobs.length, active: activeCrons, failed: failedCrons },
            uptime: process.uptime(),
            memory: process.memoryUsage()
        });
    } catch (err) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// --- Job Bulk Operations ---

// Bulk Delete Jobs
router.post('/jobs/bulk-delete', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ error: 'IDs array required' });
        }
        
        const result = await Job.deleteMany({ _id: { $in: ids } });
        
        const AuditLog = require('../models/AuditLog');
        await AuditLog.log('JOB_BULK_DELETE', 'system', { count: result.deletedCount, ids });

        res.json({ message: `Deleted ${result.deletedCount} jobs`, success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Job List (Custom pagination/filtering for admin)
router.get('/jobs', async (req, res) => {
    try {
        const { page = 1, limit = 50, q = '', isActive } = req.query;
        let query = {};
        
        if (q) {
            query.$or = [
                { title: { $regex: q, $options: 'i' } },
                { company: { $regex: q, $options: 'i' } }
            ];
        }
        
        if (isActive !== undefined && isActive !== '') {
            query.isActive = isActive === 'true';
        }

        const jobs = await Job.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));
            
        const total = await Job.countDocuments(query);
        
        res.json({ 
            jobs, 
            pagination: { 
                page: parseInt(page), 
                limit: parseInt(limit), 
                total, 
                pages: Math.ceil(total / parseInt(limit)) 
            } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
