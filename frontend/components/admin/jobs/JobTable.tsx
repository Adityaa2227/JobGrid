import { ExternalLink, ToggleLeft, ToggleRight, Trash2, Edit } from 'lucide-react';
import Link from 'next/link';
import { Job } from '@/types';

interface JobTableProps {
    jobs: Job[];
    toggleJobStatus: (id: string, current: boolean) => void;
    deleteJob: (id: string) => void;
    clearAllJobs: () => void;
    totalCount: number;
    selectedJobIds: string[];
    toggleSelection: (id: string) => void;
    toggleAll: () => void;
    onEditJob?: (job: Job) => void;
}

export default function JobTable({ 
    jobs, toggleJobStatus, deleteJob, clearAllJobs, totalCount, 
    selectedJobIds, toggleSelection, toggleAll, onEditJob 
}: JobTableProps) {
    const allSelected = jobs.length > 0 && jobs.every(j => selectedJobIds.includes(j._id));

    const getDisplayCompany = (job: Job) => {
        if (job.company && job.company !== 'Unknown') return job.company;
        const match = job.title.match(/^([^|]+?)\s+(?:Off Campus|Hiring|Recruitment|Drive|Careers|Internship|Jobs|Job)/i);
        if (match && match[1]) {
            return match[1].replace(/^(?:Direct|Urgent|Latest|New)\s+/i, '').trim();
        }
        return job.company || 'Unknown';
    };

    return (
        <div className="bg-zinc-950 border border-zinc-800 rounded-[2.5rem] overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-zinc-900/50 border-b border-zinc-800">
                    <tr>
                        <th className="px-6 py-5 w-10">
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={toggleAll}
                                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500/20"
                            />
                        </th>
                        <th className="px-6 py-5 text-xs font-black text-zinc-500 uppercase tracking-widest">Job Details</th>
                        <th className="px-6 py-5 text-xs font-black text-zinc-500 uppercase tracking-widest text-center">Apply Link</th>
                        <th className="px-6 py-5 text-xs font-black text-zinc-500 uppercase tracking-widest text-center">Traffic</th>
                        <th className="px-6 py-5 text-xs font-black text-zinc-500 uppercase tracking-widest text-center">Status</th>
                        <th className="px-6 py-5 text-xs font-black text-zinc-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                    {jobs.length === 0 && (
                        <tr>
                            <td colSpan={6} className="px-6 py-16 text-center text-zinc-600 font-bold">
                                No jobs found matching your criteria.
                            </td>
                        </tr>
                    )}
                    {jobs.map(job => {
                        const displayCompany = getDisplayCompany(job);
                        return (
                            <tr key={job._id} className={`hover:bg-zinc-900/30 transition-colors group ${selectedJobIds.includes(job._id) ? 'bg-blue-500/5' : ''}`}>
                                <td className="px-6 py-5">
                                    <input
                                        type="checkbox"
                                        checked={selectedJobIds.includes(job._id)}
                                        onChange={() => toggleSelection(job._id)}
                                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500/20"
                                    />
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-sm font-black text-amber-500 overflow-hidden shrink-0">
                                            {job.companyLogo ? (
                                                <img
                                                    src={job.companyLogo}
                                                    alt={displayCompany}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                        (e.target as HTMLImageElement).parentElement!.innerText = displayCompany.charAt(0);
                                                    }}
                                                />
                                            ) : (
                                                displayCompany.charAt(0)
                                            )}
                                        </div>
                                        <div>
                                            <Link href={`/job/${job.slug}`} className="text-white font-bold block mb-1 hover:text-blue-400 transition-colors flex items-center gap-2">
                                                {job.title}
                                                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </Link>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-amber-400 font-semibold text-xs">{displayCompany}</span>
                                                {job.location && (
                                                    <span className="text-zinc-500 text-xs">• {job.location}</span>
                                                )}
                                                {job.batch && job.batch.length > 0 && (
                                                    <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-bold">
                                                        {job.batch.join(', ')}
                                                    </span>
                                                )}
                                                {job.aiStatus === 'failed' && (
                                                    <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full font-bold">
                                                        Needs AI Repair
                                                    </span>
                                                )}
                                                {job.reportCount! > 0 && (
                                                    <span className="text-red-500 text-[10px] bg-red-500/10 px-2 py-0.5 rounded-full font-black">
                                                        🚨 {job.reportCount} Reports
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-5 text-center">
                                    <a
                                        href={job.applyUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg text-xs font-bold transition-all border border-blue-500/20 max-w-[200px]"
                                    >
                                        <span className="truncate">{job.applyUrl.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}...</span>
                                        <ExternalLink className="w-3 h-3 shrink-0" />
                                    </a>
                                </td>
                                <td className="px-6 py-5">
                                    <div className="flex items-center justify-center gap-6">
                                        <div className="text-center">
                                            <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">Views</p>
                                            <p className="text-lg font-black text-white">{job.views || 0}</p>
                                        </div>
                                        <div className="w-[1px] h-8 bg-zinc-800" />
                                        <div className="text-center">
                                            <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">Clicks</p>
                                            <p className="text-lg font-black text-white">{job.clicks || 0}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-5 text-center">
                                    <button
                                        onClick={() => toggleJobStatus(job._id, job.isActive !== false)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 mx-auto transition-all ${job.isActive !== false
                                            ? 'bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20'
                                            : 'bg-zinc-800 text-zinc-500 border border-zinc-700 hover:bg-zinc-700'}`}
                                    >
                                        {job.isActive !== false ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                                        {job.isActive !== false ? 'Live' : 'Hidden'}
                                    </button>
                                </td>
                                <td className="px-6 py-5 text-right">
                                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {onEditJob && (
                                            <button
                                                onClick={() => onEditJob(job)}
                                                className="p-2.5 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-xl transition-all"
                                                title="Edit Job"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => deleteJob(job._id)}
                                            className="p-2.5 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                                            title="Delete Job"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <div className="p-6 bg-zinc-900/50 border-t border-zinc-800 flex justify-between items-center">
                <span className="text-xs font-black text-zinc-600 uppercase tracking-widest">
                    Showing {jobs.length} of {totalCount} jobs
                </span>
                {totalCount > 0 && (
                    <button
                        onClick={clearAllJobs}
                        className="px-4 py-2 bg-zinc-900 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 text-xs font-black rounded-xl transition-all border border-zinc-800 hover:border-red-500/30 uppercase tracking-wider flex items-center gap-2"
                    >
                        <Trash2 className="w-3 h-3" /> Purge All Jobs
                    </button>
                )}
            </div>
        </div>
    );
}
