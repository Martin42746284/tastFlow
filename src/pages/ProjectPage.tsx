import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { KanbanBoard } from '@/components/KanbanBoard';
import { CreateTicketDialog } from '@/components/CreateTicketDialog';
import { TicketDetailDialog } from '@/components/TicketDetailDialog';
import { TeamManagementDialog } from '@/components/TeamManagementDialog';
import { EditProjectDialog } from '@/components/EditProjectDialog';
import { StatusBadge } from '@/components/StatusBadge';
import { AvatarGroup } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Plus, Trash2, Users, Pencil, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { projectService, Project, getCurrentUserId, User } from '@/utils/api';

const ProjectPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const currentUserId = getCurrentUserId();
  
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'team' | null>(null);

  // Charger le projet depuis MongoDB
  const loadProject = async () => {
    if (!id) return;
    
    try {
      setIsLoading(true);
      const data = await projectService.getById(id);
      setProject(data);

      // Déterminer le rôle de l'utilisateur
      const ownerId = typeof data.owner === 'object' 
        ? (data.owner._id || data.owner.id)
        : data.owner;

      if (currentUserId === ownerId) {
        setUserRole('owner');
      } else if (Array.isArray(data.admins) &&
                 data.admins.some((admin: any) => {
                   const adminId = typeof admin === 'object' ? (admin._id || admin.id) : admin;
                   return adminId === currentUserId;
                 })) {
        setUserRole('admin');
      } else if (Array.isArray(data.team) &&
                 data.team.some((member: any) => {
                   const memberId = typeof member === 'object' ? (member._id || member.id) : member;
                   return memberId === currentUserId;
                 })) {
        setUserRole('team');
      } else {
        setUserRole(null);
      }
    } catch (error: any) {
      toast({
        title: 'Erreur',
        description: 'Impossible de charger le projet',
        variant: 'destructive',
      });
      console.error('Erreur de chargement du projet:', error);
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [id]);

  // Calculer les permissions - SEULEMENT LE PROPRIÉTAIRE
  const isOwner = userRole === 'owner';
  const canEditProject = isOwner;
  const canDeleteProject = isOwner;
  const canManageTeam = isOwner;
  const canCreateTicket = isOwner;
  const canChangeStatus = isOwner;

  // Gestion du changement de statut (SEULEMENT LE PROPRIÉTAIRE)
  const handleStatusChange = async (status: 'Actif' | 'Inactif' | 'Archivé') => {
    if (!project || !canChangeStatus) {
      toast({
        title: 'Accès refusé',
        description: 'Seul le propriétaire peut modifier le statut du projet',
        variant: 'destructive',
      });
      return;
    }

    try {
      await projectService.update(project._id, { status });
      setProject({ ...project, status });
      toast({
        title: 'Statut modifié',
        description: `Le projet est maintenant "${status}".`,
      });
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Impossible de modifier le statut';
      toast({
        title: 'Erreur',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  // Gestion de la suppression (SEULEMENT LE PROPRIÉTAIRE)
  const handleDelete = async () => {
    if (!project || !canDeleteProject) {
      toast({
        title: 'Accès refusé',
        description: 'Seul le propriétaire peut supprimer le projet',
        variant: 'destructive',
      });
      return;
    }

    try {
      await projectService.delete(project._id);
      toast({
        title: 'Projet supprimé',
        description: `Le projet "${project.name}" a été supprimé.`,
        variant: 'destructive',
      });
      navigate('/');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Impossible de supprimer le projet';
      toast({
        title: 'Erreur',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  // État de chargement
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  // Projet introuvable
  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-8">
          <div className="text-center py-16">
            <h2 className="text-2xl font-bold mb-2">Projet introuvable</h2>
            <p className="text-muted-foreground mb-4">
              Le projet que vous recherchez n'existe pas ou vous n'y avez pas accès.
            </p>
            <Link to="/">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour aux projets
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Extraire les utilisateurs membres (owner + admins + team) avec gestion de doublons
  const getMemberUsers = (): User[] => {
    const users: User[] = [];
    const userIds = new Set<string>();

    // Ajouter le owner
    if (typeof project.owner === 'object' && project.owner) {
      const ownerId = project.owner._id || project.owner.id;
      if (!userIds.has(ownerId)) {
        users.push(project.owner);
        userIds.add(ownerId);
      }
    }

    // Ajouter les admins
    if (Array.isArray(project.admins)) {
      project.admins.forEach((admin) => {
        if (typeof admin === 'object' && admin) {
          const adminId = admin._id || admin.id;
          if (!userIds.has(adminId)) {
            users.push(admin);
            userIds.add(adminId);
          }
        }
      });
    }

    // Ajouter les membres de l'équipe
    if (Array.isArray(project.team)) {
      project.team.forEach((member) => {
        if (typeof member === 'object' && member) {
          const memberId = member._id || member.id;
          if (!userIds.has(memberId)) {
            users.push(member);
            userIds.add(memberId);
          }
        }
      });
    }

    return users;
  };

  const memberUsers = getMemberUsers();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8">
        {/* Breadcrumb */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux projets
        </Link>

        {/* Message d'information pour les non-propriétaires */}
        {!isOwner && (
          <div className="bg-muted p-4 rounded-lg mb-6 border border-border">
            <p className="text-sm text-muted-foreground">
              Vous êtes membre de ce projet en tant que <strong>{userRole === 'admin' ? 'Administrateur' : 'Membre de l\'équipe'}</strong>.
              Seul le propriétaire peut créer et gérer les tickets, ainsi que modifier le projet.
            </p>
          </div>
        )}

        {/* Project Header */}
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold">{project.name}</h1>
            <StatusBadge status={project.status} type="project" />
            {canEditProject && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditProjectOpen(true)}
                className="h-8 w-8"
                title="Modifier le projet"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
          {project.description && (
            <p className="text-muted-foreground">{project.description}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => canManageTeam ? setTeamDialogOpen(true) : null}
              className={`flex items-center gap-1 sm:gap-2 rounded-lg px-2 py-1 transition-colors text-sm ${
                canManageTeam ? 'hover:bg-accent/50 cursor-pointer' : 'cursor-default'
              }`}
              disabled={!canManageTeam}
              title={canManageTeam ? 'Gérer l\'équipe' : 'Membres du projet'}
            >
              <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <AvatarGroup users={memberUsers} max={5} size="sm" />
              <span className={`text-xs sm:text-sm text-muted-foreground transition-colors ${
                canManageTeam ? 'hover:text-foreground' : ''
              }`}>
                {memberUsers.length} membre{memberUsers.length !== 1 ? 's' : ''}
              </span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2 justify-between">
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {canChangeStatus ? (
                <Select value={project.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Actif">Actif</SelectItem>
                    <SelectItem value="Inactif">Inactif</SelectItem>
                    <SelectItem value="Archivé">Archivé</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="w-full sm:w-40 px-3 py-2 border border-border rounded-md bg-muted text-sm">
                  {project.status}
                </div>
              )}

              {canManageTeam && (
                <Button variant="outline" onClick={() => setTeamDialogOpen(true)} className="w-full sm:w-auto">
                  <Users className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Équipe</span>
                  <span className="sm:hidden">Gérer</span>
                </Button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {canCreateTicket && (
                <Button onClick={() => setCreateTicketOpen(true)} className="w-full sm:w-auto">
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Ajouter un ticket</span>
                  <span className="sm:hidden">Ajouter</span>
                </Button>
              )}

              {canDeleteProject && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full sm:w-auto">
                      <Trash2 className="h-4 w-4" />
                      <span className="sm:hidden ml-2">Supprimer</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer le projet</AlertDialogTitle>
                      <AlertDialogDescription>
                        Êtes-vous sûr de vouloir supprimer "{project.name}" ? Cette action est
                        irréversible et supprimera tous les tickets associés.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="border border-border/50 rounded-xl bg-card/50 p-2 sm:p-4 lg:p-6 -mx-4 sm:mx-0 sm:rounded-xl">
          <div className="px-2 sm:px-0">
            <KanbanBoard
              projectId={project._id}
              onTicketClick={setSelectedTicketId}
              onAddTicket={canCreateTicket ? () => setCreateTicketOpen(true) : undefined}
            />
          </div>
        </div>
      </main>

      {canCreateTicket && (
        <CreateTicketDialog
          open={createTicketOpen}
          onOpenChange={setCreateTicketOpen}
          projectId={project._id}
          onTicketCreated={loadProject}
        />
      )}

      <TicketDetailDialog
        ticketId={selectedTicketId}
        onClose={() => setSelectedTicketId(null)}
      />

      {canManageTeam && (
        <TeamManagementDialog
          projectId={project._id}
          open={teamDialogOpen}
          onOpenChange={setTeamDialogOpen}
          onMembersUpdated={loadProject}
        />
      )}

      {canEditProject && (
        <EditProjectDialog
          project={project}
          open={editProjectOpen}
          onOpenChange={setEditProjectOpen}
          onProjectUpdated={loadProject}
        />
      )}
    </div>
  );
};

export default ProjectPage;
