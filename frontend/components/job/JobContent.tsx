"use client";

import { CheckCircle2, ExternalLink, FileText, Target, Lightbulb, Award, ChevronRight } from 'lucide-react';
import { Job } from '@/types';
import { useSession } from 'next-auth/react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

interface JobContentProps {
    job: Job;
}

export default function JobContent({ job }: JobContentProps) {
    const { data: session } = useSession();

    const handleApply = async () => {
        if (!job.applyUrl) {
            toast.error('Application URL not found');
            return;
        }

        const newWindow = window.open(job.applyUrl, '_blank');

        try {
            await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/jobs/${job._id}/click`);
        } catch (error) {
            console.error('Failed to track click:', error);
        }

        if (session?.user?.email) {
            try {
                await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/user/applied`, {
                    email: session.user.email,
                    jobId: job._id
                });
                toast.success('Application tracked successfully!');
            } catch (error) {
                console.error('Failed to track application:', error);
            }
        }
    };

    return (
        <div className="space-y-8">
            {/* Main Content Card */}
            <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-black">
                <div className="p-8 md:p-12 space-y-12">

                    {/* Job Description */}
                    <ContentSection
                        icon={FileText}
                        iconColor="from-amber-500 to-yellow-500"
                        title="Job Description"
                    >
                        {/<\/?[a-z][\s\S]*>/i.test(job.description || '') ? (
                            <div
                                className="job-description text-zinc-300 leading-relaxed text-base md:text-lg font-normal space-y-4 [&>h1]:text-2xl [&>h1]:font-black [&>h1]:text-white [&>h1]:mt-6 [&>h1]:mb-3 [&>h2]:text-xl [&>h2]:font-black [&>h2]:text-white [&>h2]:mt-6 [&>h2]:mb-3 [&>h3]:text-lg [&>h3]:font-black [&>h3]:text-white [&>h3]:mt-6 [&>h3]:mb-3 [&>h4]:text-base [&>h4]:font-bold [&>h4]:text-white [&>h4]:mt-4 [&>h4]:mb-2 [&>h6]:text-base [&>h6]:font-bold [&>h6]:text-white [&>h6]:mt-6 [&>h6]:mb-2 [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:space-y-2 [&>ul]:my-4 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:space-y-2 [&>ol]:my-4 [&>li]:text-zinc-300 [&>p]:mb-3 [&>p]:leading-relaxed [&>strong]:text-white [&>strong]:font-bold [&>a]:text-amber-400 [&>a]:hover:underline"
                                dangerouslySetInnerHTML={{
                                    __html: (() => {
                                        let clean = job.description || '';
                                        // Remove script tags and their contents
                                        clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
                                        clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
                                        clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
                                        // Remove promotional links, WhatsApp/Telegram/Instagram invite paragraphs
                                        clean = clean.replace(/<p[^>]*>(?:<strong>)?(?:Instant Job Updates|Join our Official|Join Official|Official WhatsApp|Official Telegram|Official Instagram|Apply Link\s*:|How To Apply)[^<]*(?:<a[^>]*>[^<]*<\/a>)?[^<]*<\/p>/gi, '');
                                        clean = clean.replace(/<a[^>]*href=["'][^"']*(?:whatsapp|telegram|instagram)[^"']*["'][^>]*>.*?<\/a>/gi, '');
                                        clean = clean.replace(/<figure[^>]*>.*?<\/figure>/gis, '');
                                        clean = clean.replace(/<p[^>]*>\s*<\/p>/gi, '');
                                        return clean.trim();
                                    })()
                                }}
                            />
                        ) : (
                            <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-base md:text-lg font-medium">
                                {job.description}
                            </div>
                        )}
                    </ContentSection>

                    {job.rolesResponsibility && (
                        <ContentSection
                            icon={Target}
                            iconColor="from-blue-500 to-cyan-500"
                            title="Roles & Responsibilities"
                        >
                            <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-base md:text-lg">
                                {job.rolesResponsibility}
                            </div>
                        </ContentSection>
                    )}

                    {job.requirements && (
                        <ContentSection
                            icon={Award}
                            iconColor="from-purple-500 to-pink-500"
                            title="Requirements"
                        >
                            <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-base md:text-lg">
                                {job.requirements}
                            </div>
                        </ContentSection>
                    )}

                    {job.niceToHave && (
                        <ContentSection
                            icon={Lightbulb}
                            iconColor="from-emerald-500 to-teal-500"
                            title="Nice to Have"
                        >
                            <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-base md:text-lg">
                                {job.niceToHave}
                            </div>
                        </ContentSection>
                    )}

                    {/* Eligibility */}
                    {job.eligibility && job.eligibility.trim().length > 0 && (
                        <div className="pt-8 border-t border-zinc-800/50">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/20">
                                    <CheckCircle2 className="w-6 h-6 text-white" />
                                </div>
                                <h2 className="text-2xl font-black text-white">Eligibility Criteria</h2>
                            </div>
                            <div className="p-6 rounded-3xl bg-green-500/5 border border-green-500/20 flex items-start gap-4">
                                <ChevronRight className="w-6 h-6 text-green-400 mt-0.5 flex-shrink-0" />
                                <p className="text-zinc-200 text-lg font-bold">{job.eligibility}</p>
                            </div>
                        </div>
                    )}

                    {/* Tech Stack Tags */}
                    {job.tags && job.tags.length > 0 && (
                        <div className="pt-8 border-t border-zinc-800/50 font-sans">
                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-6">Tech Stack & Ecosystem</p>
                            <div className="flex flex-wrap gap-3">
                                {job.tags.map(tag => (
                                    <span key={tag} className="px-5 py-2.5 text-sm font-bold bg-zinc-800/50 text-zinc-300 border border-zinc-700/50 rounded-2xl hover:border-amber-500/40 hover:text-amber-400 hover:bg-amber-500/5 transition-all cursor-default">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Apply CTA Section */}
                <div className="p-10 md:p-14 bg-gradient-to-b from-transparent to-amber-500/5 border-t border-zinc-800/50">
                    <div className="text-center max-w-2xl mx-auto">
                        <div className="w-20 h-20 mx-auto mb-6 rounded-[2rem] bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-2xl shadow-amber-500/20">
                            <ExternalLink className="w-10 h-10 text-black" />
                        </div>
                        <h3 className="text-3xl md:text-4xl font-black text-white mb-4 tracking-tight">Ready to Level Up?</h3>
                        <p className="text-zinc-500 text-lg mb-10">Don't miss out on this opportunity. Click below to start your application on the official company careers portal.</p>

                        <button
                            onClick={handleApply}
                            className="inline-flex items-center justify-center gap-4 w-full max-w-md px-10 py-6 bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-black text-xl rounded-[2rem] shadow-2xl shadow-amber-500/20 hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all group"
                        >
                            Apply for Role
                            <ExternalLink className="w-6 h-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Disclaimer */}
            <p className="text-center text-zinc-600 text-xs py-4 px-8 border border-zinc-900 rounded-2xl bg-black/40">
                JobGrid uses AI to enhance job descriptions and provide career insights. Always verify details on the official company careers page before applying.
            </p>
        </div>
    );
}

function ContentSection({
    icon: Icon,
    iconColor,
    title,
    children
}: {
    icon: any;
    iconColor: string;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="animate-slow-fade">
            <div className="flex items-center gap-4 mb-6">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${iconColor} flex items-center justify-center shadow-xl shadow-black/40`}>
                    <Icon className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight">{title}</h2>
            </div>
            <div className="pl-0 md:pl-16">
                {children}
            </div>
        </section>
    );
}
