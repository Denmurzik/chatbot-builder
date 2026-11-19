import { zodResolver } from '@hookform/resolvers/zod';
import { LogOut, Plus, Workflow } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { useLogout, useMe } from '@/api/auth';
import { useCreateProject, useProjects } from '@/api/projects';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

const nameSchema = z.object({ name: z.string().trim().min(1, ru.projects.nameRequired) });

function CreateProjectDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const createProject = useCreateProject();
  const form = useForm<z.infer<typeof nameSchema>>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: '' },
  });

  const onSubmit = form.handleSubmit(({ name }) => {
    createProject.mutate(name, {
      onSuccess: (project) => {
        props.onOpenChange(false);
        form.reset();
        navigate(`/projects/${project.id}`);
      },
      onError: () => toast.error(ru.common.unknownError),
    });
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ru.projects.createTitle}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{ru.projects.nameLabel}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
                {ru.common.cancel}
              </Button>
              <Button type="submit" disabled={createProject.isPending}>
                {ru.common.create}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const { data: author } = useMe();
  const { data: projects, isLoading, isError } = useProjects();
  const logout = useLogout();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="mx-auto flex min-h-svh max-w-4xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{ru.projects.title}</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setDialogOpen(true)}>
            <Plus />
            {ru.projects.create}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">{author?.email}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
              >
                <LogOut />
                {ru.auth.logout}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {isLoading ? <p className="text-muted-foreground">{ru.common.loading}</p> : null}
      {isError ? <p className="text-destructive">{ru.projects.loadError}</p> : null}
      {projects && projects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <Workflow className="size-8" />
          <p>{ru.projects.empty}</p>
        </div>
      ) : null}
      {projects && projects.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id}>
              <Link to={`/projects/${project.id}`}>
                <Card className="transition-colors hover:bg-accent">
                  <CardHeader>
                    <CardTitle>{project.name}</CardTitle>
                    <CardDescription>
                      {ru.projects.updatedAt}: {new Date(project.updatedAt).toLocaleString('ru-RU')}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <CreateProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
