import '@/app/globals.css';
import { Outfit, Bodoni_Moda, Lora, JetBrains_Mono } from 'next/font/google';

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' });
const bodoni = Bodoni_Moda({ subsets: ['latin'], variable: '--font-bodoni-moda', style: ['normal', 'italic'] });
const lora = Lora({ subsets: ['latin'], variable: '--font-lora', style: ['normal', 'italic'] });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' });

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${outfit.variable} ${bodoni.variable} ${lora.variable} ${jetbrains.variable}`}>
      {children}
    </div>
  );
}
