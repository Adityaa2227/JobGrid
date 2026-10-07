import { getJobBySlug, getSimilarJobs } from '@/services/api';
import Footer from '@/components/Footer';
import JobCard from '@/components/JobCard';
import { notFound } from 'next/navigation';
import { ArrowLeft, Sparkles, Users, TrendingUp, Clock, Share2 } from 'lucide-react';
import Link from 'next/link';
import { Metadata } from 'next';
import { Job } from '@/types';
import JobHeader from '@/components/job/JobHeader';
import JobContent from '@/components/job/JobContent';
import JobSidebar from '@/components/job/JobSidebar';
import JobSchema from '@/components/job/JobSchema';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    try {
        const { slug } = await params;
        const job = await getJobBySlug(slug);
        const comp = (job.company && job.company !== 'Unknown')
            ? job.company
            : (job.title.match(/^([^|]+?)\s+(?:Off Campus|Hiring|Recruitment|Drive|Careers|Internship|Jobs|Job)/i)?.[1]?.replace(/^(?:Direct|Urgent|Latest|New)\s+/i, '').trim() || job.company || 'Company');
        const loc = job.location || (job.title.match(/\|\s*([^|]+)$/)?.[1]?.trim() || 'Remote');
        const sal = job.salary || 'Competitive';

        return {
            title: `${job.title} at ${comp} | JobGrid`,
            description: `${job.title} job opening at ${comp}. Location: ${loc}. Salary: ${sal}. Apply now!`,
            alternates: {
                canonical: `/job/${slug}`,
            },
            openGraph: {
                title: `${job.title} at ${comp}`,
                description: `${job.title} job opening at ${comp}. Apply now!`,
                type: 'article',
                images: [
                    {
                        url: `/api/og?title=${encodeURIComponent(job.title)}&company=${encodeURIComponent(comp)}&location=${encodeURIComponent(loc)}&salary=${encodeURIComponent(sal)}&batch=${encodeURIComponent(job.batch?.[0] || '')}`,
                        width: 1200,
                        height: 630,
                        alt: `${job.title} at ${comp}`,
                    },
                ],
            },
            twitter: {
                card: 'summary_large_image',
                title: `${job.title} at ${comp}`,
                description: `${job.title} job opening at ${comp}. Apply now!`,
                images: [`/api/og?title=${encodeURIComponent(job.title)}&company=${encodeURIComponent(comp)}&location=${encodeURIComponent(loc)}&salary=${encodeURIComponent(sal)}&batch=${encodeURIComponent(job.batch?.[0] || '')}`],
            },
        };
    } catch {
        return {
            title: 'Job Not Found',
        };
    }
}

export default async function JobDetail({ params }: { params: Promise<{ slug: string }> }) {
    let job: Job;
    let relatedJobs: Job[] = [];

    const { slug } = await params;

    try {
        job = await getJobBySlug(slug);
    } catch (err) {
        return notFound();
    }

    try {
        relatedJobs = await getSimilarJobs(job._id);
    } catch (err) {
        console.error("Failed to fetch related jobs", err);
        relatedJobs = [];
    }

    // Calculate freshness
    const hoursAgo = Math.floor((new Date().getTime() - new Date(job.createdAt).getTime()) / (1000 * 60 * 60));
    const isFresh = hoursAgo < 24;

    const displayCompany = (job.company && job.company !== 'Unknown')
        ? job.company
        : (job.title.match(/^([^|]+?)\s+(?:Off Campus|Hiring|Recruitment|Drive|Careers|Internship|Jobs|Job)/i)?.[1]?.replace(/^(?:Direct|Urgent|Latest|New)\s+/i, '').trim() || job.company || 'Company');

    return (
        <main className="min-h-screen bg-black relative overflow-hidden">
            <JobSchema job={job} />

            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-amber-500/5 rounded-full blur-[200px] pointer-events-none" />
            <div className="absolute bottom-1/4 left-0 w-[500px] h-[500px] bg-yellow-500/5 rounded-full blur-[150px] pointer-events-none" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(245,158,11,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.015)_1px,transparent_1px)] bg-[size:60px_60px] pointer-events-none" />


            <div className="relative pt-32 pb-20 px-4">
                <div className="max-w-6xl mx-auto">

                    {/* Breadcrumb & Back */}
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <Link
                                href="/jobs"
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all font-medium text-sm group"
                            >
                                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                                All Jobs
                            </Link>
                            <span className="text-zinc-700">/</span>
                            <span className="text-zinc-500 text-sm truncate max-w-[200px]">{displayCompany}</span>
                        </div>

                        {/* Quick Stats */}
                        <div className="hidden md:flex items-center gap-4">
                            <div className="flex items-center gap-2 text-zinc-500 text-sm">
                                <Users className="w-4 h-4 text-blue-400" />
                                <span><strong className="text-white">{job.views || 0}</strong> views</span>
                            </div>
                            <div className="flex items-center gap-2 text-zinc-500 text-sm">
                                <TrendingUp className="w-4 h-4 text-green-400" />
                                <span><strong className="text-white">{job.clicks || 0}</strong> clicks</span>
                            </div>
                            {isFresh && (
                                <span className="px-3 py-1 bg-green-500/10 text-green-500 text-xs font-bold rounded-full border border-green-500/20 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" /> Posted {hoursAgo}h ago
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                        {/* Main Content */}
                        <div className="lg:col-span-8 space-y-8">
                            <JobHeader job={job} />
                            <JobContent job={job} />

                            {/* Related Jobs */}
                            {relatedJobs.length > 0 && (
                                <div className="mt-12">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                                            <Sparkles className="w-5 h-5 text-white" />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-black text-white">Similar Opportunities</h2>
                                            <p className="text-zinc-500 text-sm">Jobs you might also be interested in</p>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        {relatedJobs.slice(0, 3).map((rJob, idx) => (
                                            <JobCard key={rJob._id} job={rJob} index={idx} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sidebar */}
                        <div className="lg:col-span-4">
                            <JobSidebar job={job} slug={slug} />
                        </div>

                    </div>
                </div>
            </div>

            <Footer />
        </main>
    );
}
