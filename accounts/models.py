from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_CHOICES = [
        ('ADMIN', 'Administrateur'),
        ('ENSEIGNANT', 'Enseignant'),
        ('PARENT', 'Parent'),
        ('ELEVE', 'Élève'),
        ('SECRETAIRE', 'Secrétaire (inscriptions, élèves)'),
        ('COMPTABLE', 'Comptable (caisse)'),
        ('SURVEILLANT', 'Surveillant (absences)'),
        ('COMMUNICATION', 'Responsable du site public'),
        ('SUPER_ADMIN', 'Super administrateur plateforme'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='ELEVE')
    roles_supplementaires = models.JSONField(
        default=list, blank=True,
        help_text="Petites écoles : rôles cumulés par la même personne (voir accounts.roles.CUMULS_AUTORISES).",
    )
    enseignant = models.OneToOneField(
        'cours.Enseignant',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='user'
    )
    eleve = models.ForeignKey(
        'eleves.Eleve',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='comptes'
    )
    enfants = models.ManyToManyField(
        'eleves.Eleve',
        blank=True,
        related_name='parents',
        verbose_name='Enfants'
    )
    ecole = models.ForeignKey(
        'parametres.Parametres',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='utilisateurs',
    )
    is_plateforme = models.BooleanField(
        default=False,
        help_text="Compte plateforme : voit la liste des écoles, pas les données d'une école.",
    )
    must_change_password = models.BooleanField(
        default=False,
        help_text="L'utilisateur doit changer le mot de passe temporaire à la première connexion.",
    )

    signature = models.ImageField(
        upload_to='signatures_utilisateurs/', null=True, blank=True,
        help_text="Signature du comptable : imprimée automatiquement sur les reçus qu'il délivre.",
    )

    class Meta:
        db_table = 'auth_user_custom'

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

    @property
    def roles(self):
        """Rôle principal + rôles cumulés autorisés."""
        from .roles import roles_de
        return roles_de(self)


class JournalAction(models.Model):
    """Une ligne du journal d'activité (voir accounts/journal.py). Jamais modifiée ni supprimée par l'appli."""
    ACTIONS = [
        ('CREATION', 'Ajout'),
        ('MODIFICATION', 'Modification'),
        ('SUSPENSION', 'Suspension'),
        ('REACTIVATION', 'Réactivation'),
        ('SUPPRESSION', 'Suppression'),
        ('CONNEXION', 'Connexion'),
        ('AUTRE', 'Autre'),
    ]
    ecole = models.ForeignKey('parametres.Parametres', on_delete=models.SET_NULL, null=True, blank=True, related_name='journal')
    utilisateur = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='actions_journal')
    nom_utilisateur = models.CharField(max_length=150, blank=True, default='')  # figé : reste lisible si le compte change
    role = models.CharField(max_length=60, blank=True, default='')
    action = models.CharField(max_length=20, choices=ACTIONS)
    objet_type = models.CharField(max_length=60, blank=True, default='')
    objet_id = models.CharField(max_length=40, blank=True, default='')
    objet_libelle = models.CharField(max_length=255, blank=True, default='')
    details = models.JSONField(default=list, blank=True)  # [{champ, avant, apres}]
    ip = models.GenericIPAddressField(null=True, blank=True)
    date = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'journal_action'
        ordering = ['-date', '-id']
        indexes = [models.Index(fields=['ecole', '-date'])]

    def __str__(self):
        return f"{self.date:%d/%m/%Y %H:%M} — {self.nom_utilisateur} : {self.get_action_display()} {self.objet_type}"


class IncidentServeur(models.Model):
    """Erreur du serveur (ou réponse très lente) : où, quand, pour qui. Lu par le super admin."""
    NIVEAUX = [('ERREUR', 'Erreur'), ('LENT', 'Lenteur'), ('CLIENT', 'Erreur dans le navigateur')]
    niveau = models.CharField(max_length=8, choices=NIVEAUX, default='ERREUR')
    statut_http = models.PositiveSmallIntegerField(default=500)
    methode = models.CharField(max_length=8, blank=True, default='')
    chemin = models.CharField(max_length=255, blank=True, default='')
    message = models.CharField(max_length=500, blank=True, default='')
    detail = models.TextField(blank=True, default='')
    duree_ms = models.PositiveIntegerField(null=True, blank=True)
    utilisateur = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    nom_utilisateur = models.CharField(max_length=150, blank=True, default='')
    role = models.CharField(max_length=30, blank=True, default='')
    ecole = models.ForeignKey('parametres.Parametres', on_delete=models.SET_NULL, null=True, blank=True, related_name='incidents')
    date = models.DateTimeField(auto_now_add=True, db_index=True)
    resolu = models.BooleanField(default=False)
    resolu_le = models.DateTimeField(null=True, blank=True)
    resolu_par = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    class Meta:
        db_table = 'incident_serveur'
        ordering = ['-date']
        indexes = [models.Index(fields=['resolu', '-date'])]

    @property
    def chemin_type(self):
        """/api/eleves/42/carte/ → /api/eleves/…/carte/ : les mêmes erreurs se regroupent."""
        import re
        return re.sub(r'/\d+(?=/|$)', '/…', self.chemin or '')

    def __str__(self):
        return f"{self.date:%d/%m/%Y %H:%M} {self.niveau} {self.methode} {self.chemin}"


class Maintenance(models.Model):
    """Mode maintenance de la plateforme (une seule ligne). Pendant la période, seul le super admin utilise l'application ;
    toutes les adresses du site affichent la page de maintenance."""
    actif = models.BooleanField(default=False)
    debut = models.DateTimeField(null=True, blank=True)  # vide = tout de suite
    fin = models.DateTimeField(null=True, blank=True)    # vide = jusqu'à ce que le super admin l'arrête
    titre = models.CharField(max_length=120, default='Maintenance en cours')
    message = models.TextField(max_length=600, default="Nous améliorons l'application. Elle sera de nouveau disponible très bientôt.")
    modifie_par = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'maintenance'

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def en_cours(self, maintenant=None):
        from django.utils import timezone
        n = maintenant or timezone.now()
        return bool(self.actif and (self.debut is None or self.debut <= n) and (self.fin is None or self.fin > n))

    def programmee(self, maintenant=None):
        from django.utils import timezone
        n = maintenant or timezone.now()
        return bool(self.actif and self.debut and self.debut > n and (self.fin is None or self.fin > n))


class StatRequetes(models.Model):
    """Trafic agrégé par heure et par école : nombre de requêtes, erreurs, lenteurs, temps de réponse."""
    heure = models.DateTimeField(db_index=True)
    ecole = models.ForeignKey('parametres.Parametres', on_delete=models.CASCADE, null=True, blank=True, related_name='+')
    requetes = models.PositiveIntegerField(default=0)
    erreurs = models.PositiveIntegerField(default=0)
    lentes = models.PositiveIntegerField(default=0)
    duree_totale_ms = models.BigIntegerField(default=0)
    duree_max_ms = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'stat_requetes'
        unique_together = [['heure', 'ecole']]
        ordering = ['-heure']


class AnnoncePlateforme(models.Model):
    """Message de la plateforme affiché en bandeau dans les écoles (maintenance, incident en cours, nouveauté)."""
    NIVEAUX = [('info', 'Information'), ('warning', 'Attention'), ('error', 'Incident')]
    CIBLES = [('TOUS', 'Tous les utilisateurs'), ('DIRECTION', 'Directeurs et équipes')]
    titre = models.CharField(max_length=120)
    message = models.TextField(max_length=600)
    niveau = models.CharField(max_length=8, choices=NIVEAUX, default='info')
    cible = models.CharField(max_length=10, choices=CIBLES, default='TOUS')
    ecoles = models.ManyToManyField('parametres.Parametres', blank=True, related_name='annonces')  # vide = toutes les écoles
    debut = models.DateTimeField()
    fin = models.DateTimeField(null=True, blank=True)
    active = models.BooleanField(default=True)
    cree_par = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'annonce_plateforme'
        ordering = ['-debut']


class ClientSyncReceipt(models.Model):
    """Reçu de mutation offline : empêche le double-traitement d'un même client_id."""
    client_id = models.CharField(max_length=64, unique=True, db_index=True)
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='sync_receipts'
    )
    path = models.CharField(max_length=255, blank=True, default='')
    status_code = models.PositiveSmallIntegerField(default=200)
    response_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'client_sync_receipt'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.client_id} ({self.status_code})"
