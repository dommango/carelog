import { Suspense } from 'react';
import { googleEnabled } from '@/auth';
import LoginForm from './login-form';

export default function LoginPage() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <Suspense fallback={null}>
        <LoginForm googleEnabled={googleEnabled} />
      </Suspense>
    </div>
  );
}
