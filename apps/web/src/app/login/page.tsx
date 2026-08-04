import { Suspense } from 'react';
import { googleEnabled } from '@/lib/env';
import LoginForm from './login-form';

export default function LoginPage() {
  return (
    <div className="cc flex min-h-[100dvh] flex-col justify-center bg-sand px-[30px] py-11">
      <Suspense fallback={null}>
        <LoginForm googleEnabled={googleEnabled} />
      </Suspense>
      <p className="mx-auto mt-8 max-w-sm text-center text-sm text-ink-faint">
        CareLog is a record-keeping tool for informal caregivers, not a medical device. It
        does not provide medical advice — in an emergency, call your local emergency
        number.
      </p>
    </div>
  );
}
