import { motion } from 'framer-motion';

export default function Hero() {
    return (
        <div className="flex flex-col items-center justify-center text-center gap-6">
            <motion.div
                className="heading-glow"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, ease: 'easeOut' }}
            >
                <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white">
                    Search Beyond <br /> Words.
                </h1>
            </motion.div>

            <motion.p
                className="text-gray-400 text-lg mt-4 max-w-xl leading-relaxed"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
            >
                One unified interface for text, images, audio, and video.
                Powered by multimodal AI for the next generation of retrieval.
            </motion.p>
        </div>
    );
}
