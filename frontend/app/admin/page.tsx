"use client";

import { useState, useEffect } from 'react';
import { Job, QueueItem, AdminAnalytics } from '@/types';
import AdminSidebar, { AdminTab } from '@/components/admin/AdminSidebar';
import CEODashboard from '@/components/admin/CEODashboard';
import JobsTab from '@/components/admin/JobsTab';
import QueueTab from '@/components/admin/QueueTab';
import AnalyticsTab from '@/components/admin/AnalyticsTab';
import ScraperTab from '@/components/admin/ScraperTab';
import BatchAlerts from '@/components/admin/BatchAlerts';
import SettingsTab from '@/components/admin/SettingsTab';
import UsersTab from '@/components/admin/UsersTab';
import CronManager from '@/components/admin/CronManager';
import AuditLog from '@/components/admin/AuditLog';
import SystemHealth from '@/components/admin/SystemHealth';
import NotificationCenter from '@/components/admin/NotificationCenter';
import EmailGenerator from '@/components/admin/EmailGenerator';
import { toast } from 'react-hot-toast';
import AdminLogin from '@/components/admin/AdminLogin';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://jobgrid-in.onrender.com';

export default function AdminDashboard() {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [analytics, setAnalytics] = useState<AdminAnalytics>({ totalJobs: 0, totalViews: 0, totalClicks: 0 });
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [cleaning, setCleaning] = useState(false);
    const [activeTab, setActiveTab] = useState<AdminTab>('ceo');
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [jobFilter, setJobFilter] = useState<'all' | 'reported'>('all');
    const [dashboardStats, setDashboardStats] = useState<any>(null);

    const [isAuthenticated, setIsAuthenticated] = useState(false);

    const fetchDashboardStats = async (showToast = false) => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/dashboard-stats`);
            const data = await res.json();
            setDashboardStats(data);
            if (showToast) {
                toast.success(
                    `Analysis Complete: Found ${data.expiredJobs || 0} expired, ${data.zeroEngagementJobs || 0} stale, and ${data.reportedJobs || 0} reported jobs.`
                );
            }
        } catch (err) {
            console.error('Failed to fetch CEO stats', err);
            if (showToast) toast.error('Failed to run analysis');
        }
    };

    const fetchData = async () => {
        try {
            const [jobsRes, analyticsRes, queueRes, chartRes] = await Promise.all([
                fetch(`${BACKEND_URL}/api/jobs?limit=100`),
                fetch(`${BACKEND_URL}/api/analytics`),
                fetch(`${BACKEND_URL}/api/admin/queue`),
                fetch(`${BACKEND_URL}/api/admin/analytics/detailed`)
            ]);

            const jobsData = await jobsRes.json();
            const analyticsData = await analyticsRes.json();
            const queueData = await queueRes.json();
            const chartData = await chartRes.json();

            setJobs(jobsData.jobs || []);
            setAnalytics(analyticsData);
            setQueue(queueData || []);
            setChartData(chartData || []);
        } catch (err) {
            console.error('Failed to fetch admin data', err);
        } finally {
            setLoading(false);
        }
    };

    const runCleanup = async () => {
        if (!confirm('Archive non-featured jobs older than 30 days?')) return;
        setCleaning(true);
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/cleanup`, { method: 'POST' });
            const data = await res.json();
            toast.success(data.message);
            fetchData();
        } catch (err) {
            console.error('Cleanup failed', err);
        } finally {
            setCleaning(false);
        }
    };

    const runQueueItem = async (id: string) => {
        try {
            await fetch(`${BACKEND_URL}/api/admin/queue/${id}/run`, { method: 'POST' });
            fetchData();
        } catch (err) {
            console.error('Failed to run queue item', err);
        }
    };

    const deleteQueueItem = async (id: string) => {
        if (!confirm('Cancel this scheduled job?')) return;
        try {
            await fetch(`${BACKEND_URL}/api/admin/queue/${id}`, { method: 'DELETE' });
            setQueue(queue.filter(q => q._id !== id));
        } catch (err) {
            console.error('Failed to delete queue item', err);
        }
    };

    const clearQueue = async (status: string = 'pending') => {
        const confirmMsg = status === 'pending'
            ? 'Clear all pending jobs from the queue?'
            : 'Clear all processed job history?';

        if (!confirm(`${confirmMsg} This cannot be undone.`)) return;

        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/queue/clear?status=${status}`, { method: 'DELETE' });
            const data = await res.json();
            toast.success(data.message);
            fetchData();
        } catch (err) {
            console.error('Failed to clear queue', err);
            toast.error('Failed to clear queue');
        }
    };

    const clearAllJobs = async () => {
        if (!confirm('EXTREME CAUTION: This will delete ALL job listings from the database. Are you absolutely sure?')) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/jobs/clear`, { method: 'DELETE' });
            const data = await res.json();
            toast.success(data.message);
            fetchData();
        } catch (err) {
            console.error('Failed to clear jobs', err);
            toast.error('Failed to clear jobs');
        }
    };

    const clearReportedJobs = async () => {
        if (!confirm('Clear all reported jobs from the database?')) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/jobs/reported`, { method: 'DELETE' });
            const data = await res.json();
            toast.success(data.message);
            fetchData();
        } catch (err) {
            console.error('Failed to clear reported jobs', err);
            toast.error('Failed to clear reported jobs');
        }
    };

    const toggleJobStatus = async (jobId: string, currentStatus: boolean) => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/jobs/${jobId}/toggle`, { method: 'PUT' });
            if (!res.ok) throw new Error('Failed to toggle');

            setJobs(jobs.map(j =>
                j._id === jobId ? { ...j, isActive: !currentStatus } : j
            ));
        } catch (err) {
            console.error('Failed to toggle job status', err);
            toast.error('Failed to update status');
        }
    };

    const deleteJob = async (jobId: string) => {
        if (!confirm('Are you sure you want to delete this job?')) return;
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/jobs/${jobId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');

            setJobs(jobs.filter(j => j._id !== jobId));
        } catch (err) {
            console.error('Failed to delete job', err);
            toast.error('Failed to delete job');
        }
    };

    useEffect(() => {
        // Check session storage for persistence
        const auth = sessionStorage.getItem('adminAuth');
        if (auth === 'true') {
            setIsAuthenticated(true);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated) {
            // Initial fetch
            fetchData();
            fetchDashboardStats();

            // Poll every 15 seconds
            const interval = setInterval(() => {
                fetchData();
                fetchDashboardStats();
            }, 15000);

            return () => clearInterval(interval);
        }
    }, [isAuthenticated]);

    if (!isAuthenticated) {
        return <AdminLogin apiUrl={BACKEND_URL} onLoginSuccess={() => setIsAuthenticated(true)} />;
    }


    if (loading) {
        return (
            <main className="min-h-screen bg-black p-8">
                <div className="max-w-7xl mx-auto text-center py-20">
                    <div className="animate-spin w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-zinc-500">Loading Dashboard Command Center...</p>
                </div>
            </main>
        );
    }
    return (
        <main className="min-h-screen bg-black flex overflow-hidden">
            {/* Mobile Sidebar Overlay */}
            <div
                className={`fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity ${!isCollapsed ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setIsCollapsed(true)}
            />

            <AdminSidebar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                isCollapsed={isCollapsed}
                setIsCollapsed={setIsCollapsed}
                pendingCount={queue.filter(q => q.status === 'pending').length}
            />

            <div className={`flex-1 transition-all duration-300 h-screen overflow-y-auto w-full ${isCollapsed ? 'md:ml-20' : 'md:ml-64'} ml-0`}>
                {/* Mobile Header with Toggle */}
                <div className="md:hidden p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950 sticky top-0 z-30">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-2 text-white">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        </button>
                        <span className="font-bold text-white">JobGrid Admin</span>
                    </div>
                </div>
                <div className="max-w-7xl mx-auto p-12">
                    {/* Page Content Mapper */}
                    {activeTab === 'ceo' && (
                        <CEODashboard
                            stats={dashboardStats}
                            loading={loading}
                            onRefresh={() => {
                                fetchDashboardStats(true);
                                fetchData();
                            }}
                        />
                    )}

                    {activeTab === 'jobs' && (
                        <JobsTab
                            jobs={jobs}
                            analytics={analytics}
                            jobFilter={jobFilter}
                            setJobFilter={setJobFilter}
                            toggleJobStatus={toggleJobStatus}
                            deleteJob={deleteJob}
                            clearAllJobs={clearAllJobs}
                            clearReportedJobs={clearReportedJobs}
                            onRefresh={fetchData}
                        />
                    )}

                    {activeTab === 'users' && (
                        <UsersTab apiUrl={BACKEND_URL} />
                    )}

                    {activeTab === 'queue' && (
                        <QueueTab
                            queue={queue}
                            runQueueItem={runQueueItem}
                            deleteQueueItem={deleteQueueItem}
                            clearQueue={clearQueue}
                            refreshQueue={fetchData}
                        />
                    )}

                    {activeTab === 'analytics' && (
                        <AnalyticsTab
                            chartData={chartData}
                            runCleanup={runCleanup}
                            cleaning={cleaning}
                        />
                    )}

                    {activeTab === 'scraper' && (
                        <ScraperTab apiUrl={BACKEND_URL} />
                    )}

                    {activeTab === 'alerts' && (
                        <BatchAlerts />
                    )}

                    {activeTab === 'settings' && (
                        <SettingsTab refreshData={fetchData} />
                    )}

                    {activeTab === 'cron' && (
                        <CronManager />
                    )}

                    {activeTab === 'audit' && (
                        <AuditLog apiUrl={BACKEND_URL} />
                    )}

                    {activeTab === 'health' && (
                        <SystemHealth />
                    )}

                    {activeTab === 'notifications' && (
                        <NotificationCenter />
                    )}

                    {activeTab === 'email' && (
                        <EmailGenerator />
                    )}
                </div>
            </div>
        </main>
    );
}
