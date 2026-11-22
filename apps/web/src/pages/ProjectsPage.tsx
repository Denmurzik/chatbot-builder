import { zodResolver } from '@hookform/resolvers/zod';
import { LogOut, MoreVertical, Pencil, Plus, Trash2, Workflow } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { useLogout, useMe } from '@/api/auth';
import {
  type ProjectSummary,
  useCreateProject,
  useDeleteProject,
  useProjects,
  useRenameProject,
} from '@/api/projects';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

// Диалог переименования проекта
function RenameProjectDialog(props: { project: ProjectSummary; onClose: () => void }) {
  const renameProject = useRenameProject();
  const form = useForm<z.infer<typeof nameSchema>>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: props.project.name },
  });

  const onSubmit = form.handleSubmit(({ name }) => {
    renameProject.mutate(
      { id: props.project.id, name },
      {
        onSuccess: () => {
          toast.success(ru.projects.renamed);
          props.onClose();
        },
        onError: () => toast.error(ru.projects.renameError),
      },
    );
  });

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ru.projects.renameTitle}</DialogTitle>
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
              <Button type="button" variant="outline" onClick={props.onClose}>
                {ru.common.cancel}
              </Button>
              <Button type="submit" disabled={renameProject.isPending}>
                {ru.projects.renameSave}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Диалог подтверждения удаления проекта с предупреждением о подключённых ботах
function DeleteProjectDialog(props: { project: ProjectSummary; onClose: () => void }) {
  const deleteProject = useDeleteProject();
  const botsCount = props.project.botsCount ?? 0;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : props.onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ru.projects.deleteTitle}</DialogTitle>
          <DialogDescription>{ru.projects.deleteDescription(props.project.name)}</DialogDescription>
        </DialogHeader>
        {botsCount > 0 ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {ru.projects.deleteBotsWarning(botsCount)}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={props.onClose}>
            {ru.common.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteProject.isPending}
            onClick={() =>
              deleteProject.mutate(props.project.id, {
                onSuccess: () => {
                  toast.success(ru.projects.deleted);
                  props.onClose();
                },
                onError: () => toast.error(ru.projects.deleteError),
              })
            }
          >
            {ru.projects.delete}
          </Button>
        </DialogFooter>
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
  const [renamingProject, setRenamingProject] = useState<ProjectSummary | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectSummary | null>(null);

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
              <Card className="relative transition-colors hover:bg-accent">
                <Link
                  to={`/projects/${project.id}`}
                  className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <CardHeader className="pr-14">
                    <CardTitle>{project.name}</CardTitle>
                    <CardDescription>
                      {ru.projects.updatedAt}: {new Date(project.updatedAt).toLocaleString('ru-RU')}
                    </CardDescription>
                  </CardHeader>
                </Link>
                <div className="absolute top-3 right-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={ru.projects.actionsLabel(project.name)}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreVertical className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setRenamingProject(project)}>
                        <Pencil className="size-4" />
                        {ru.projects.rename}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setDeletingProject(project)}
                      >
                        <Trash2 className="size-4" />
                        {ru.projects.delete}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      <CreateProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      {renamingProject ? (
        <RenameProjectDialog project={renamingProject} onClose={() => setRenamingProject(null)} />
      ) : null}
      {deletingProject ? (
        <DeleteProjectDialog project={deletingProject} onClose={() => setDeletingProject(null)} />
      ) : null}
    </div>
  );
}
