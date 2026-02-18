import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-white">
      <Image src="/MOA_logo.svg" alt="Next.js logo" width={500} height={500} />
    </div>
  );
}
