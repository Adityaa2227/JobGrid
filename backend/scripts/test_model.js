const Groq = require('groq-sdk');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

(async () => {
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: 'You are an SEO content generator. Output only valid JSON.' },
                { role: 'user', content: 'Generate JSON for Reliance Jio GET role in Mumbai.' }
            ],
            model: 'openai/gpt-oss-20b',
            response_format: { type: 'json_object' }
        });
        console.log('SEO generation working:', completion.choices[0].message.content);
    } catch (e) {
        console.error('Error:', e);
    }
})();
