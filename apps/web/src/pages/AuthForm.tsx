import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { ru } from '@/i18n/ru';

const schema = z.object({
  email: z.string().email(ru.auth.invalidEmail),
  password: z.string().min(8, ru.auth.passwordTooShort),
});

export type AuthFormValues = z.infer<typeof schema>;

interface AuthFormProps {
  title: string;
  description: string;
  submitLabel: string;
  pending: boolean;
  errorMessage?: string;
  onSubmit: (values: AuthFormValues) => void;
  footer: React.ReactNode;
}

// Общая форма входа и регистрации
export function AuthForm(props: AuthFormProps) {
  const form = useForm<AuthFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{props.title}</CardTitle>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(props.onSubmit)} className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{ru.auth.email}</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{ru.auth.password}</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {props.errorMessage ? (
                <p role="alert" className="text-sm text-destructive">
                  {props.errorMessage}
                </p>
              ) : null}
              <Button type="submit" disabled={props.pending}>
                {props.submitLabel}
              </Button>
            </form>
          </Form>
          <p className="text-center text-sm text-muted-foreground">{props.footer}</p>
        </CardContent>
      </Card>
    </div>
  );
}
