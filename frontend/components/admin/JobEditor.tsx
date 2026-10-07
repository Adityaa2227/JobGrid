"use client";

import { useState } from 'react';
import { Plus, Briefcase, Save, X, Loader } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface JobFormData {
    title: string;
    company: string;
    location: string;
    salary: string;
    description: string;
    applyUrl: string;
    category: string;
    jobType: string;
    batch: string;
    tags: string;
    isRemote: boolean;
}

const INITIAL_FORM: JobFormData = {
    title: '',
    company: '',
    location: '',
    salary: '',
    description: '',
    applyUrl: '',
    category: 'Engineering',
    jobType: 'FullTime',
    batch: '',
    tags: '',
    isRemote: false
};

interface JobEditorProps {
    job?: any;
    onClose: () => void;
    onSave: () => void;
}

export default function JobEditor({ job, onClose, onSave }: JobEditorProps) {
    const prefillCompany = (() => {
        if (job?.company && job.company !== 'Unknown') return job.company;
        const match = (job?.title || '').match(/^([^|]+?)\s+(?:Off Campus|Hiring|Recruitment|Drive|Careers|Internship|Jobs|Job)/i);
        if (match && match[1]) return match[1].replace(/^(?:Direct|Urgent|Latest|New)\s+/i, '').trim();
        return job?.company || '';
    })();

    const prefillLocation = (() => {
        if (job?.location && !['Not specified', 'Pending', 'Pending AI', ''].includes(job.location)) return job.location;
        const match = (job?.title || '').match(/\|\s*([^|]+)$/);
        return match && match[1] ? match[1].trim() : (job?.location || '');
    })();

    const [form, setForm] = useState<JobFormData>(job ? {
        title: job.title || '',
        company: prefillCompany,
        location: prefillLocation,
        salary: job.salary || '',
        description: job.description || '',
        applyUrl: job.applyUrl || '',
        category: job.category || 'Engineering',
        jobType: job.jobType || 'FullTime',
        batch: job.batch?.join(', ') || '',
        tags: job.tags?.join(', ') || '',
        isRemote: job.isRemote || false
    } : INITIAL_FORM);
    const [saving, setSaving] = useState(false);

    const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://jobgrid-in.onrender.com';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const payload = {
                ...form,
                batch: form.batch.split(',').map(b => b.trim()).filter(Boolean),
                tags: form.tags.split(',').map(t => t.trim()).filter(Boolean)
            };

            const url = job
                ? `${BACKEND_URL}/api/admin/jobs/${job._id}`
                : `${BACKEND_URL}/api/admin/jobs`;

            const res = await fetch(url, {
                method: job ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Failed to save job');

            toast.success(job ? 'Job updated!' : 'Job created!');
            onSave();
            onClose();
        } catch (err) {
            toast.error('Failed to save job');
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (field: keyof JobFormData, value: any) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Briefcase className="w-5 h-5 text-amber-500" />
                        <h2 className="text-lg font-bold text-white">
                            {job ? 'Edit Job' : 'Create New Job'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                        <X className="w-5 h-5 text-zinc-400" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Title */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Title *</label>
                        <input
                            type="text"
                            required
                            value={form.title}
                            onChange={(e) => handleChange('title', e.target.value)}
                            placeholder="Software Engineer at Google"
                            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                        />
                    </div>

                    {/* Company & Location */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Company *</label>
                            <input
                                type="text"
                                required
                                value={form.company}
                                onChange={(e) => handleChange('company', e.target.value)}
                                placeholder="Google"
                                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Location</label>
                            <input
                                type="text"
                                value={form.location}
                                onChange={(e) => handleChange('location', e.target.value)}
                                placeholder="Bangalore, India"
                                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Salary & Apply URL */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Salary</label>
                            <input
                                type="text"
                                value={form.salary}
                                onChange={(e) => handleChange('salary', e.target.value)}
                                placeholder="10-15 LPA"
                                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Apply URL *</label>
                            <input
                                type="url"
                                required
                                value={form.applyUrl}
                                onChange={(e) => handleChange('applyUrl', e.target.value)}
                                placeholder="https://careers.google.com/..."
                                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Category, Type, Remote */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Category</label>
                            <select
                                value={form.category}
                                onChange={(e) => handleChange('category', e.target.value)}
                                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:border-amber-500 focus:outline-none"
                            >
                                <option value="Engineering">Engineering</option>
                                <option value="Data Science">Data Science</option>
                                <option value="Product">Product</option>
                                <option value="Design">Design</option>
                                <option value="Marketing">Marketing</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Job Type</label>
                            <select
                                value={form.jobType}
                                onChange={(e) => handleChange('jobType', e.target.value)}
                                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:border-amber-500 focus:outline-none"
                            >
                                <option value="FullTime">Full Time</option>
                                <option value="Internship">Internship</option>
                                <option value="Contract">Contract</option>
                            </select>
                        </div>
                        <div className="flex items-end pb-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={form.isRemote}
                                    onChange={(e) => handleChange('isRemote', e.target.checked)}
                                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-amber-500 focus:ring-amber-500"
                                />
                                <span className="text-sm text-zinc-400">Remote</span>
                            </label>
                        </div>
                    </div>

                    {/* Batch & Tags */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Batch (comma separated)</label>
                            <input
                                type="text"
                                value={form.batch}
                                onChange={(e) => handleChange('batch', e.target.value)}
                                placeholder="2024, 2025"
                                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-400 mb-1">Tags (comma separated)</label>
                            <input
                                type="text"
                                value={form.tags}
                                onChange={(e) => handleChange('tags', e.target.value)}
                                placeholder="React, Node.js, AWS"
                                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Description</label>
                        <textarea
                            value={form.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            rows={4}
                            placeholder="Job description..."
                            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:border-amber-500 focus:outline-none resize-none"
                        />
                    </div>

                    {/* Submit */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 text-black font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
                        >
                            {saving ? (
                                <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4" />
                            )}
                            {job ? 'Update' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
