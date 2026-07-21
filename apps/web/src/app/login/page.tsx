import { Suspense } from 'react';
import { googleEnabled } from '@/auth';
import LoginForm from './login-form';

export default function LoginPage() {
  return (
    <div className="cc flex min-h-[100dvh] flex-col justify-center bg-sand px-[30px] py-11">
      <Suspense fallback={null}>
        <LoginForm googleEnabled={googleEnabled} />
      </Suspense>
    </div>
  );
}
