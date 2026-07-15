import { Icon } from '@/components/Icon';

export default function VerifyRequestPage() {
  return (
    <div className="cc flex min-h-[100dvh] flex-col justify-center bg-sand px-[30px] py-11">
      <div className="mx-auto w-full max-w-sm text-center">
        <div className="mb-6 flex items-center justify-center gap-[11px]">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-caregiver text-white">
            <Icon name="cal" size={21} />
          </span>
          <span className="cc-serif text-2xl">
            Care<span className="text-caregiver-ink">Log</span>
          </span>
        </div>

        <h1 className="cc-serif mb-3 text-[26px] leading-[1.2]">Check your email</h1>
        <p className="mb-6 text-[15px] font-semibold leading-normal text-ink-soft">
          We&apos;ve sent you a sign-in link. Open it on this device to finish signing in.
        </p>

        <div className="cc-note cc-note--calm mx-auto max-w-xs text-left">
          <span className="cc-note-ic">
            <Icon name="check" size={16} />
          </span>
          <span>The link is good for a single sign-in and expires shortly.</span>
        </div>
      </div>
    </div>
  );
}
