import Link from 'next/link';
import { Icon } from '@/components/Icon';

export default function VerifyRequestPage() {
  return (
    <div className="cc flex min-h-[100dvh] flex-col justify-center bg-sand px-[30px] py-11">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-11 flex items-center gap-[11px]">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-caregiver text-white">
            <Icon name="cal" size={21} />
          </span>
          <span className="cc-serif text-2xl">
            Care<span className="text-caregiver-ink">Log</span>
          </span>
        </div>

        <h1 className="cc-serif mb-3 text-[30px] leading-[1.2]">Check your email</h1>
        <p className="mb-8 text-[15px] font-semibold leading-normal text-ink-soft">
          A sign-in link is on its way to your inbox. Open it on this device to continue.
        </p>

        <div className="cc-note cc-note--calm">
          <span className="cc-note-ic">
            <Icon name="check" size={16} />
          </span>
          <span>
            The link expires shortly and can only be used once. If it does not arrive, check
            your spam folder.
          </span>
        </div>

        <p className="mt-6 text-center text-[12.5px] font-bold text-ink-faint">
          <Link href="/login" className="text-accent-deep hover:text-accent">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
