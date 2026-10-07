"use client";

import { format, formatDistanceToNowStrict } from 'date-fns';
import { MapPin, Banknote, Calendar, Clock, Eye, Building2, MousePointerClick, Sparkles, Users, TrendingUp, Briefcase } from 'lucide-react';
import { Job } from '@/types';

interface JobHeaderProps {
    job: Job;
}

export default function JobHeader({ job }: JobHeaderProps) {
    const isFresh = new Date().getTime() - new Date(job.createdAt).getTime() < 4 * 60 * 60 * 1000;
    const isNew = new Date().getTime() - new Date(job.createdAt).getTime() < 24 * 60 * 60 * 1000;

    const displayCompany = (() => {
        if (job.company && job.company !== 'Unknown') return job.company;
        const match = job.title.match(/^([^|]+?)\s+(?:Off Campus|Hiring|Recruitment|Drive|Careers|Internship|Jobs|Job)/i);
        if (match && match[1]) {
            return match[1].replace(/^(?:Direct|Urgent|Latest|New)\s+/i, '').trim();
        }
        return job.company || 'Company';
    })();

    const displayLocation = (() => {
        if (job.location && job.location !== 'Not specified' && job.location !== 'Pending' && job.location !== 'Pending AI') {
            return job.location;
        }
        const match = job.title.match(/\|\s*([^|]+)$/);
        if (match && match[1]) return match[1].trim();
        return 'Not specified';
    })();

    const displaySalary = (job.salary && job.salary !== 'Pending') ? job.salary : 'Competitive';

    return (
        <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-[2rem] overflow-hidden">
            {/* Gold accent */}
            <div className="h-1.5 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500" />

            {/* Header Content */}
            <div className="p-8">
                <div className="flex items-start gap-6 mb-8">
                    {/* Company Logo */}
                    <div className="relative">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border-2 border-zinc-700/50 flex items-center justify-center text-3xl font-black text-amber-400 overflow-hidden shadow-xl">
                            {job.companyLogo ? (
                                <img
                                    src={job.companyLogo}
                                    alt={displayCompany}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-3xl font-black text-amber-400">${displayCompany.charAt(0)}</span>`;
                                    }}
                                />
                            ) : (
                                displayCompany.charAt(0)
                            )}
                        </div>
                        {isFresh && (
                            <span className="absolute -top-1 -right-1 flex h-4 w-4">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500 border-2 border-zinc-900" />
                            </span>
                        )}
                    </div>

                    {/* Title & Company */}
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3 flex-wrap">
                            <span className="px-3 py-1.5 text-xs font-black uppercase tracking-widest bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
                                {job.category}
                            </span>
                            {job.isFeatured && (
                                <span className="px-3 py-1.5 text-xs font-black uppercase tracking-widest bg-gradient-to-r from-amber-500 to-yellow-500 text-black rounded-lg flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3" /> Featured
                                </span>
                            )}
                            {isNew && (
                                <span className="px-3 py-1.5 text-xs font-black uppercase tracking-widest bg-green-500/10 text-green-500 rounded-lg border border-green-500/20">
                                    New
                                </span>
                            )}
                            {job.jobType && (
                                <span className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${job.jobType === 'Internship'
                                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    }`}>
                                    {job.jobType === 'Internship' ? '🎯' : '💼'} {job.jobType}
                                </span>
                            )}
                            {job.isRemote && (
                                <span className="px-3 py-1.5 text-xs font-bold bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20">
                                    🌐 Remote
                                </span>
                            )}
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black text-white mb-2 leading-tight">
                            {job.title}
                        </h1>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-zinc-400">
                                <Building2 className="w-5 h-5" />
                                <span className="font-bold text-lg">{displayCompany}</span>
                            </div>
                            <span className="text-zinc-700">•</span>
                            <span className="flex items-center gap-1.5 text-zinc-500 text-sm font-medium">
                                <Clock className="w-4 h-4" />
                                <span suppressHydrationWarning>
                                    {formatDistanceToNowStrict(new Date(job.createdAt), { addSuffix: true })}
                                </span>
                            </span>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                        icon={MapPin}
                        label="Location"
                        value={displayLocation}
                        color="amber"
                    />
                    <StatCard
                        icon={Banknote}
                        label="Salary"
                        value={displaySalary}
                        color="green"
                    />
                    <StatCard
                        icon={Calendar}
                        label="Apply By"
                        value={job.lastDate || 'ASAP'}
                        color="orange"
                    />
                    <StatCard
                        icon={Eye}
                        label="Views"
                        value={job.views?.toLocaleString() || '0'}
                        color="blue"
                    />
                </div>

                {/* Batch Tags */}
                {job.batch && job.batch.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-zinc-800">
                        <p className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Eligible Batches</p>
                        <div className="flex flex-wrap gap-2">
                            {job.batch.map(b => (
                                <span key={b} className="px-4 py-2 text-sm font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl">
                                    🎓 {b} Batch
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({ icon: Icon, label, value, color }: {
    icon: any;
    label: string;
    value: string;
    color: 'amber' | 'green' | 'orange' | 'blue';
}) {
    const colorMap = {
        amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        green: 'text-green-400 bg-green-500/10 border-green-500/20',
        orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
        blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    };

    return (
        <div className="p-4 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 hover:border-zinc-600/50 transition-colors">
            <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg border ${colorMap[color]}`}>
                    <Icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black">{label}</span>
            </div>
            <p className="text-white font-bold text-lg truncate">{value}</p>
        </div>
    );
}
