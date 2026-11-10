from django.db import models
from django.utils import timezone

from eleves.models import _stockage_prive
from .ordre import rang_niveau


class Niveau(models.Model):
    nom = models.CharField(max_length=50)
    is_active = models.BooleanField(default=True)
    is_classe_examen = models.BooleanField(
        default=False,
        help_text="Classe d'examen (BEPC, Bac...) — seules ces classes peuvent programmer un Examen Blanc."
    )
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='niveaux',
    )

    # Rang calculé depuis le nom (6ème < 5ème < … < Terminale) : sert à trier niveaux et classes partout
    ordre = models.PositiveIntegerField(default=0, editable=False)

    class Meta:
        db_table = 'niveau'
        ordering = ['ordre', 'nom']
        unique_together = [['nom', 'ecole']]

    def save(self, *args, **kwargs):
        self.ordre = rang_niveau(self.nom)
        champs = kwargs.get('update_fields')
        if champs is not None:
            kwargs['update_fields'] = set(champs) | {'ordre'}
        super().save(*args, **kwargs)

    def __str__(self):
        return self.nom


class Classe(models.Model):
    nom = models.CharField(max_length=20)
    niveau = models.ForeignKey(Niveau, on_delete=models.CASCADE, related_name='classes')
    professeur_principal = models.ForeignKey(
        'cours.Enseignant', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='classes_principales'
    )
    is_active = models.BooleanField(default=True)
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='classes',
    )

    class Meta:
        db_table = 'classe'
        unique_together = [['nom', 'niveau']]
        ordering = ['niveau__ordre', 'niveau__nom', 'nom']

    def __str__(self):
        return self.nom


class AnneeScolaire(models.Model):
    libelle = models.CharField(max_length=20)
    is_active = models.BooleanField(default=True)
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='annees',
    )

    class Meta:
        db_table = 'annee_scolaire'
        ordering = ['-libelle']
        unique_together = [['libelle', 'ecole']]

    def __str__(self):
        return self.libelle


class Trimestre(models.Model):
    nom = models.CharField(max_length=50)
    annee_scolaire = models.ForeignKey(
        AnneeScolaire, on_delete=models.CASCADE, related_name='trimestres'
    )
    is_active = models.BooleanField(default=True)
    # Tant que la direction ne l'a pas ouvert, élèves et parents ne peuvent pas récupérer le bulletin du trimestre
    bulletins_ouverts = models.BooleanField(default=False)
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='trimestres',
    )

    class Meta:
        db_table = 'trimestre'
        unique_together = [['nom', 'annee_scolaire']]
        ordering = ['annee_scolaire', 'nom']

    def __str__(self):
        return f"{self.nom} — {self.annee_scolaire}"


class Inscription(models.Model):
    STATUT_CHOICES = [
        ('INSCRIT', 'Inscrit'),
        ('SORTI', 'Sorti'),
        ('DIPLOME', 'Diplômé'),
    ]
    date_inscription = models.DateField(auto_now_add=True)
    eleve = models.ForeignKey(
        'eleves.Eleve', on_delete=models.CASCADE, related_name='inscriptions'
    )
    classe = models.ForeignKey(
        Classe, on_delete=models.RESTRICT, related_name='inscriptions',
        null=True, blank=True
    )
    annee_scolaire = models.ForeignKey(
        AnneeScolaire, on_delete=models.PROTECT, related_name='inscriptions',
        null=True, blank=True
    )
    redoublant = models.BooleanField(default=False)
    statut = models.CharField(max_length=12, choices=STATUT_CHOICES, default='INSCRIT')
    is_active = models.BooleanField(default=True)
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='inscriptions',
    )

    class Meta:
        db_table = 'inscription'
        unique_together = [['eleve', 'annee_scolaire']]
        ordering = ['classe', 'eleve__nom']

    def save(self, *args, **kwargs):
        # Une inscription sans année n'appartient à aucune année : on la rattache à l'année active.
        if self.annee_scolaire_id is None and self.ecole_id:
            from .utils import get_annee_active
            annee = get_annee_active(self.ecole)
            if annee is not None:
                self.annee_scolaire = annee
                if kwargs.get('update_fields') is not None:
                    kwargs['update_fields'] = list(set(kwargs['update_fields']) | {'annee_scolaire'})
        super().save(*args, **kwargs)

    def __str__(self):
        annee = self.annee_scolaire.libelle if self.annee_scolaire else '?'
        return f"{self.eleve} → {self.classe} ({annee})"


class DemandeInscription(models.Model):
    """Préinscription publique (site vitrine) — pas encore d'élève / compte."""
    STATUT_EN_ATTENTE = 'EN_ATTENTE'
    STATUT_ACCEPTEE = 'ACCEPTEE'
    STATUT_REFUSEE = 'REFUSEE'
    STATUT_CHOICES = [
        (STATUT_EN_ATTENTE, 'En attente'),
        (STATUT_ACCEPTEE, 'Acceptée'),
        (STATUT_REFUSEE, 'Refusée'),
    ]

    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        related_name='demandes_inscription',
    )
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    date_naissance = models.DateField(null=True, blank=True)
    sexe = models.CharField(
        max_length=1, choices=[('M', 'Masculin'), ('F', 'Féminin')],
        blank=True, default='',
    )
    niveau_souhaite = models.ForeignKey(
        Niveau, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='demandes_inscription',
    )
    nom_parent = models.CharField(max_length=150)
    telephone_parent = models.CharField(max_length=30)
    email_parent = models.EmailField(blank=True, default='')
    message = models.TextField(blank=True, default='')
    photo = models.ImageField(upload_to='dossiers_preinscription/', null=True, blank=True)
    statut = models.CharField(
        max_length=12, choices=STATUT_CHOICES, default=STATUT_EN_ATTENTE, db_index=True,
    )
    motif_refus = models.TextField(blank=True, default='')
    date_depot = models.DateTimeField(auto_now_add=True)
    date_traitement = models.DateTimeField(null=True, blank=True)
    traite_par = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='demandes_traitees',
    )
    eleve_cree = models.ForeignKey(
        'eleves.Eleve', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='demande_origine',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'demande_inscription'
        ordering = ['-date_depot']

    def __str__(self):
        return f"{self.prenom} {self.nom} — {self.get_statut_display()}"


class ResultatExamenNational(models.Model):
    """Liste officielle des admis BEPC / BAC saisie par le directeur."""
    EXAMEN_CHOICES = [
        ('BEPC', 'BEPC (3ème)'),
        ('BAC', 'BAC (Terminale)'),
    ]
    eleve = models.ForeignKey(
        'eleves.Eleve', on_delete=models.CASCADE, related_name='resultats_examen'
    )
    annee_scolaire = models.ForeignKey(
        AnneeScolaire, on_delete=models.CASCADE, related_name='resultats_examen'
    )
    examen = models.CharField(max_length=8, choices=EXAMEN_CHOICES)
    admis = models.BooleanField(default=True)
    serie_2nde = models.CharField(
        max_length=4, blank=True, default='',
        help_text="Série pour le passage 3ème → 2nde (A, C, D). Vide = 2nde A."
    )
    saisi_par = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='resultats_examen_saisis'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='resultats_examen',
    )

    class Meta:
        db_table = 'resultat_examen_national'
        unique_together = [['eleve', 'annee_scolaire', 'examen']]
        ordering = ['examen', 'eleve__nom']

    def __str__(self):
        etat = 'admis' if self.admis else 'ajourné'
        return f"{self.examen} {self.eleve} ({etat})"


class PassageAnnee(models.Model):
    """Historique d'un lancement de passage d'année par le directeur."""
    annee_source = models.ForeignKey(
        AnneeScolaire, on_delete=models.CASCADE, related_name='passages_source'
    )
    annee_cible = models.ForeignKey(
        AnneeScolaire, on_delete=models.CASCADE, related_name='passages_cible'
    )
    lance_par = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='passages_lances'
    )
    date_lancement = models.DateTimeField(auto_now_add=True)
    admis = models.PositiveIntegerField(default=0)
    redoublants = models.PositiveIntegerField(default=0)
    diplomes = models.PositiveIntegerField(default=0)
    en_attente_examen = models.PositiveIntegerField(default=0)
    ignores = models.PositiveIntegerField(default=0)
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='passages',
    )

    class Meta:
        db_table = 'passage_annee'
        ordering = ['-date_lancement']

    def __str__(self):
        return f"Passage {self.annee_source} → {self.annee_cible}"


class PieceDemande(models.Model):
    """Pièce jointe à une préinscription en ligne (acte de naissance, bulletin…). Fichier privé."""
    demande = models.ForeignKey(DemandeInscription, on_delete=models.CASCADE, related_name='pieces')
    type = models.CharField(max_length=30)
    fichier = models.FileField(upload_to='demandes/%Y/%m/', storage=_stockage_prive)
    nom_fichier = models.CharField(max_length=255, blank=True, default='')
    taille = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'piece_demande'
        ordering = ['type', 'id']

    def __str__(self):
        return f'{self.demande_id} — {self.type}'


class Actualite(models.Model):
    """Article publié par la direction sur la page publique de l'école."""
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE, related_name='actualites',
    )
    titre = models.CharField(max_length=160)
    contenu = models.TextField()
    image = models.ImageField(upload_to='actualites/', null=True, blank=True)
    publie = models.BooleanField(default=True)
    epingle = models.BooleanField(default=False)  # affiché en premier
    date_publication = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'actualite'
        ordering = ['-epingle', '-date_publication', '-id']

    def __str__(self):
        return self.titre


class PhotoActualite(models.Model):
    """Photo de la galerie d'une actualité (facultatif ; la photo de couverture reste Actualite.image)."""
    MAX_PAR_ACTUALITE = 20

    actualite = models.ForeignKey(Actualite, on_delete=models.CASCADE, related_name='photos')
    image = models.ImageField(upload_to='actualites/galerie/')
    ordre = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'actualite_photo'
        ordering = ['ordre', 'id']

    def __str__(self):
        return f'Photo {self.pk} — {self.actualite}'
