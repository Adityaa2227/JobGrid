import { Briefcase, Wrench, Plus, RefreshCw } from 'lucide-react';
import { Job, AdminAnalytics } from '@/types';
import { useState } from 'react';
import JobStats from './jobs/JobStats';
import JobFilterBar from './jobs/JobFilterBar';
import JobTable from './jobs/JobTable';
import JobEditor from './JobEditor';
import { toast } from 'react-hot-toast';

interface JobsTabProps {
    jobs: Job[];
    analytics: AdminAnalytics;
    jobFilter: 'all' | 'reported';
    setJobFilter: (filter: 'all' | 'reported') => void;
    toggleJobStatus: (id: string, current: boolean) => void;
    deleteJob: (id: string) => void;
    clearAllJobs: () => void;
    clearReportedJobs: () => void;
    onRefresh?: () => void;
}

export default function JobsTab({
    jobs, analytics, jobFilter, setJobFilter,
    toggleJobStatus, deleteJob, clearAllJobs, clearReportedJobs, onRefresh
}: JobsTabProps) {
    const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRepairing, setIsRepairing] = useState(false);
    const [editingJob, setEditingJob] = useState<Job | null>(null);
    const [isCreatingJob, setIsCreatingJob] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const reportedJobs = jobs.filter(j => (j.reportCount || 0) > 0);
    const filteredJobs = jobFilter === 'reported' ? reportedJobs : jobs;
    const displayJobs = filteredJobs.filter(j =>
        j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        j.company.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const toggleSelection = (id: string) => {
        setSelectedJobIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleAll = () => {
        if (selectedJobIds.length === displayJobs.length) {
            setSelectedJobIds([]);
        } else {
            setSelectedJobIds(displayJobs.map(j => j._id));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedJobIds.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedJobIds.length} jobs? This cannot be undone.`)) return;

        setIsDeleting(true);
        try {
            const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://jobgrid-in.onrender.com';
            const res = await fetch(`${BACKEND_URL}/api/admin/jobs/bulk-delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: selectedJobIds })
            });
            const data = await res.json();

            if (res.ok) {
                setSelectedJobIds([]);
                toast.success(data.message || 'Jobs deleted successfully');
                if (onRefresh) onRefresh();
            } else {
                toast.error(data.error || 'Failed to delete jobs');
            }
        } catch (err) {
            console.error('Bulk delete failed', err);
            toast.error('Failed to delete jobs');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleRepairAll = async () => {
        if (!confirm('Re-parse and repair all jobs with "Unknown" company, missing location, or failed status using AI & schema?')) return;

        setIsRepairing(true);
        toast.loading('Repairing jobs with AI & title extractor...', { id: 'repair-toast' });
        try {
            const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://jobgrid-in.onrender.com';
            const res = await fetch(`${BACKEND_URL}/api/admin/jobs/repair-all`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();

            if (res.ok) {
                toast.success(data.message || `Repaired ${data.repairedCount} jobs!`, { id: 'repair-toast' });
                if (onRefresh) onRefresh();
            } else {
                toast.error(data.error || 'Failed to repair jobs', { id: 'repair-toast' });
            }
        } catch (err: any) {
            console.error('Repair failed', err);
            toast.error('Failed to repair jobs: ' + err.message, { id: 'repair-toast' });
        } finally {
            setIsRepairing(false);
        }
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header with Quick Action Buttons */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white mb-2 tracking-tight flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
                            <Briefcase className="w-6 h-6 text-white" />
                        </div>
                        Job Control Center
                    </h2>
                    <p className="text-zinc-500 font-medium">Manage listings, monitor engagement, and handle reports.</p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRepairAll}
                        disabled={isRepairing}
                        className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                        title="Automatically repair jobs with 'Unknown' company or missing data"
                    >
                        <Wrench className={`w-4 h-4 ${isRepairing ? 'animate-spin' : ''}`} />
                        {isRepairing ? 'Repairing...' : 'Repair & Fix Unknown Jobs'}
                    </button>

                    <button
                        onClick={() => setIsCreatingJob(true)}
                        className="px-5 py-2.5 bg-white hover:bg-zinc-200 text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 hover:scale-105 active:scale-95"
                    >
                        <Plus className="w-4 h-4" />
                        Add Job
                    </button>
                </div>
            </div>

            <JobStats
                totalJobs={analytics.totalJobs || jobs.length}
                reportedCount={reportedJobs.length}
                analytics={analytics}
            />

            <JobFilterBar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                jobFilter={jobFilter}
                setJobFilter={setJobFilter}
                totalCount={jobs.length}
                reportedCount={reportedJobs.length}
                onClearReported={clearReportedJobs}
                selectedCount={selectedJobIds.length}
                onBulkDelete={handleBulkDelete}
                isDeleting={isDeleting}
            />

            <JobTable
                jobs={displayJobs}
                toggleJobStatus={toggleJobStatus}
                deleteJob={deleteJob}
                clearAllJobs={clearAllJobs}
                totalCount={jobs.length}
                selectedJobIds={selectedJobIds}
                toggleSelection={toggleSelection}
                toggleAll={toggleAll}
                onEditJob={(job) => setEditingJob(job)}
            />

            {/* Edit / Create Modal */}
            {(editingJob || isCreatingJob) && (
                <JobEditor
                    job={editingJob || undefined}
                    onClose={() => {
                        setEditingJob(null);
                        setIsCreatingJob(false);
                    }}
                    onSave={() => {
                        setEditingJob(null);
                        setIsCreatingJob(false);
                        if (onRefresh) onRefresh();
                    }}
                />
            )}
        </div>
    );
}
