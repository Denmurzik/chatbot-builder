import { zodResolver } from '@hookform/resolvers/zod';
import type { BotView, ValidationError } from '@chatbot/model';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  useBots,
  useConnectTelegram,
  useCreateBot,
  useDeleteBot,
  useDisconnectTelegram,
  usePublishBot,
  useSaveEnvironment,
} from '@/api/bots';
import { ApiError } from '@/api/client';
import { EnvironmentEditor } from '@/components/EnvironmentEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

const nameSchema = z.object({ name: z.string().trim().min(1, ru.bots.nameRequired) });
const tokenSchema = z.object({ token: z.string().trim().min(1, ru.bots.tokenRequired) });

function CreateBotDialog(props: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createBot = useCreateBot(props.projectId);
  const form = useForm<z.infer<typeof nameSchema>>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: '' },
  });
  const onSubmit = form.handleSubmit(({ name }) => {
    createBot.mutate(name, {
      onSuccess: () => {
        props.onOpenChange(false);
        form.reset();
      },
      onError: () => toast.error(ru.common.unknownError),
    });
  });
  const close = (open: boolean) => {
    if (!open) form.reset();
    props.onOpenChange(open);
  };
  return (
    <Dialog open={props.open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ru.bots.createTitle}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{ru.bots.nameLabel}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                {ru.common.cancel}
              </Button>
              <Button type="submit" disabled={createBot.isPending}>
                {ru.common.create}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteBotDialog(props: { projectId: string; bot: BotView; onClose: () => void }) {
  const deleteBot = useDeleteBot(props.projectId);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ru.bots.deleteTitle}</DialogTitle>
          <DialogDescription>{ru.bots.deleteDescription(props.bot.name)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={props.onClose}>
            {ru.common.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteBot.isPending}
            onClick={() =>
              deleteBot.mutate(props.bot.id, {
                onSuccess: () => {
                  toast.success(ru.bots.deleted);
                  props.onClose();
                },
                onError: () => toast.error(ru.common.unknownError),
              })
            }
          >
            {ru.bots.delete}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function tokenErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return ru.bots.tokenTaken;
    if (error.status === 400) return ru.bots.tokenInvalid;
    if (error.status === 502) return ru.bots.tokenUnavailable;
  }
  return ru.common.unknownError;
}

function TelegramSection(props: { projectId: string; bot: BotView }) {
  const connect = useConnectTelegram(props.projectId, props.bot.id);
  const disconnect = useDisconnectTelegram(props.projectId, props.bot.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const connection = props.bot.connections[0];
  const form = useForm<z.infer<typeof tokenSchema>>({
    resolver: zodResolver(tokenSchema),
    defaultValues: { token: '' },
  });

  const onSubmit = form.handleSubmit(({ token }) => {
    setServerError(null);
    connect.mutate(token, {
      onSuccess: () => {
        form.reset();
        toast.success(ru.bots.tokenSaved);
      },
      onError: (error) => setServerError(tokenErrorMessage(error)),
    });
  });

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{ru.bots.tokenSection}</h3>
      {connection ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-muted-foreground">{connection.tokenMask}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disconnect.isPending}
            onClick={() =>
              disconnect.mutate(undefined, { onError: () => toast.error(ru.common.unknownError) })
            }
          >
            {ru.bots.tokenDisconnect}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{ru.bots.notConnected}</p>
      )}
      <Form {...form}>
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <FormField
            control={form.control}
            name="token"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{ru.bots.tokenLabel}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    autoComplete="off"
                    onChange={(event) => {
                      setServerError(null);
                      field.onChange(event);
                    }}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">{ru.bots.tokenHint}</p>
                <FormMessage />
                {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
              </FormItem>
            )}
          />
          <div>
            <Button type="submit" variant="outline" disabled={connect.isPending}>
              {connection ? ru.bots.tokenReplace : ru.bots.tokenConnect}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}

// 400 несёт русское сообщение сервера с подробностями; без него — общая подсказка
function environmentErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    const message = (error.body as { message?: unknown } | undefined)?.message;
    return typeof message === 'string' ? message : ru.bots.environmentInvalid;
  }
  return ru.common.unknownError;
}

function EnvironmentSection(props: { projectId: string; bot: BotView }) {
  const save = useSaveEnvironment(props.projectId, props.bot.id);
  const [error, setError] = useState<string | null>(null);
  // После успешного сохранения строки собираются заново: введённые секреты не остаются в состоянии
  const [resetKey, setResetKey] = useState(0);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{ru.bots.environmentSection}</h3>
      <EnvironmentEditor
        key={resetKey}
        value={props.bot.environment}
        saving={save.isPending}
        error={error}
        onSave={(input) => {
          setError(null);
          save.mutate(input, {
            onSuccess: () => {
              setResetKey((key) => key + 1);
              toast.success(ru.bots.environmentSaved);
            },
            onError: (e) =>
              setError(environmentErrorMessage(e)),
          });
        }}
      />
    </section>
  );
}

function PublishSection(props: { projectId: string; bot: BotView }) {
  const publish = usePublishBot(props.projectId, props.bot.id);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  const onPublish = () => {
    setErrors([]);
    setFailure(null);
    publish.mutate(undefined, {
      onSuccess: (result) => toast.success(ru.bots.published(result.warnings.length)),
      onError: (error) => {
        if (error instanceof ApiError && error.status === 422) {
          const body = error.body as { errors?: ValidationError[] } | undefined;
          setErrors(body?.errors ?? []);
          if (!body?.errors?.length) setFailure(error.message);
        } else if (error instanceof ApiError && error.status === 502) {
          setFailure(ru.bots.publishUnavailable);
        } else {
          setFailure(ru.common.unknownError);
        }
      },
    });
  };

  return (
    <section className="flex flex-col gap-2">
      <div>
        <Button type="button" onClick={onPublish} disabled={publish.isPending}>
          {publish.isPending
            ? ru.bots.publishing
            : props.bot.status === 'PUBLISHED'
              ? ru.bots.republish
              : ru.bots.publish}
        </Button>
      </div>
      {errors.length > 0 ? (
        <div role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">
          <p className="font-medium text-destructive">{ru.bots.publishErrorsTitle}</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((item, index) => (
              <li key={`${item.rule}-${item.blockId ?? ''}-${index}`}>{item.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {failure ? <p className="text-sm text-destructive">{failure}</p> : null}
    </section>
  );
}

function BotCard(props: { projectId: string; bot: BotView; onDelete: () => void }) {
  const { bot } = props;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>{bot.name}</CardTitle>
          <CardDescription>
            {bot.status === 'PUBLISHED' ? ru.bots.statusPublished : ru.bots.statusCreated}
            {bot.publishedAt
              ? `. ${ru.bots.publishedAt}: ${new Date(bot.publishedAt).toLocaleString('ru-RU')}`
              : ''}
            {bot.connections[0] ? `. ${ru.bots.connectedAs}: ${bot.connections[0].tokenMask}` : ''}
          </CardDescription>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={props.onDelete}>
          <Trash2 />
          {ru.bots.delete}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <TelegramSection projectId={props.projectId} bot={bot} />
        <EnvironmentSection projectId={props.projectId} bot={bot} />
        <PublishSection projectId={props.projectId} bot={bot} />
      </CardContent>
    </Card>
  );
}

export function BotsPage() {
  const { id = '' } = useParams();
  const { data: bots, isLoading, isError } = useBots(id);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<BotView | null>(null);

  return (
    <div className="mx-auto flex min-h-svh max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to={`/projects/${id}`}
            className="flex items-center gap-1 text-sm text-muted-foreground"
          >
            <ArrowLeft className="size-4" />
            {ru.bots.back}
          </Link>
          <h1 className="text-xl font-semibold">{ru.bots.title}</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          {ru.bots.create}
        </Button>
      </header>

      {isLoading ? <p className="text-muted-foreground">{ru.common.loading}</p> : null}
      {isError ? <p className="text-destructive">{ru.bots.loadError}</p> : null}
      {bots && bots.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {ru.bots.empty}
        </div>
      ) : null}
      {bots?.map((bot) => (
        <BotCard key={bot.id} projectId={id} bot={bot} onDelete={() => setDeleting(bot)} />
      ))}

      <CreateBotDialog projectId={id} open={createOpen} onOpenChange={setCreateOpen} />
      {deleting ? (
        <DeleteBotDialog projectId={id} bot={deleting} onClose={() => setDeleting(null)} />
      ) : null}
    </div>
  );
}
