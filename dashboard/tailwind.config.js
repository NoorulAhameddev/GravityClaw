/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                bg: '#0f172a',
                surface: '#1e293b',
                surface2: '#263348',
                border: '#334155',
                text: '#f1f5f9',
                muted: '#94a3b8',
                accent: {
                    DEFAULT: '#6366f1',
                    hover: '#4f46e5',
                },
                success: '#10b981',
                danger: '#ef4444',
                warning: '#f59e0b',
                info: '#3b82f6',
            },
        },
    },
    plugins: [],
}
