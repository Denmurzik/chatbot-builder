import { Link, useNavigate } from 'react-router-dom';
import { useRegister } from '@/api/auth';
import { ApiError } from '@/api/client';
import { ru } from '@/i18n/ru';
import { AuthForm } from './AuthForm';

export function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegister();

  let errorMessage: string | undefined;
  if (register.error) {
    const error = register.error;
    if (error instanceof ApiError && error.status === 409) {
      errorMessage = ru.auth.emailTaken;
    } else if (error instanceof ApiError && error.status === 400) {
      errorMessage = error.issues?.[0]?.message ?? ru.auth.passwordTooShort;
    } else {
      errorMessage = ru.common.unknownError;
    }
  }

  return (
    <AuthForm
      title={ru.auth.registerTitle}
      description={ru.auth.registerDescription}
      submitLabel={ru.auth.submitRegister}
      pending={register.isPending}
      errorMessage={errorMessage}
      onSubmit={(values) => register.mutate(values, { onSuccess: () => navigate('/projects') })}
      footer={
        <>
          {ru.auth.haveAccount}{' '}
          <Link to="/login" className="text-foreground underline underline-offset-4">
            {ru.auth.toLogin}
          </Link>
        </>
      }
    />
  );
}
