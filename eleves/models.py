from django.conf import settings
from django.db import models


class Eleve(models.Model):
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    matricule = models.CharField(max_length=20)
    date_naissance = models.DateField(null=True, blank=True)
    lieu_naissance = models.CharField(max_length=100, blank=True, default='')
    sexe = models.CharField(max_length=1, choices=[('M', 'Masculin'), ('F', 'Féminin')], blank=True, default='')
    nom_parent = models.CharField(max_length=100, blank=True, default='')
    prenom_parent = models.CharField(max_length=100, blank=True, default='')
    telephone_parent = models.CharField(max_length=20, blank=True, default='')
    photo = models.ImageField(upload_to='photos_eleves/', null=True, blank=True)
    is_active = models.BooleanField(default=True)
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='eleves',
    )

    class Meta:
        db_table = 'eleve'
        ordering = ['nom', 'prenom']
        unique_together = [['matricule', 'ecole']]

    def __str__(self):
        return f"{self.matricule} — {self.prenom} {self.nom}"


class Presence(models.Model):
    STATUT_CHOICES = [
        ('PRESENT', 'Présent'),
        ('ABSENT', 'Absent'),
        ('RETARD', 'En retard'),
        ('EXCUSE', 'Excusé'),
    ]
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='presences')
    classe_matiere = models.ForeignKey(
        'cours.ClasseMatiere', on_delete=models.CASCADE, related_name='presences'
    )
    date = models.DateField()
    statut = models.CharField(max_length=10, choices=STATUT_CHOICES, default='PRESENT')
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='presences',
    )
    # justification d'une absence : décidée par le directeur, avec le motif (maladie, raison familiale…)
    justifiee = models.BooleanField(default=False)
    motif_justification = models.CharField(max_length=200, blank=True, default='')
    justifiee_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    justifiee_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'presence'
        unique_together = [['eleve', 'classe_matiere', 'date']]
        indexes = [
            models.Index(fields=['-date'], name='presence_date_desc_idx'),
            models.Index(fields=['eleve', '-date'], name='presence_eleve_date_idx'),
        ]

    def __str__(self):
        return f"{self.eleve} — {self.date} : {self.get_statut_display()}"


class AppelJournalier(models.Model):
    """Appel du jour : une ligne par élève / classe / date (indépendant de la présence par cours)."""
    STATUT_CHOICES = [
        ('PRESENT', 'Présent'),
        ('ABSENT', 'Absent'),
        ('RETARD', 'Retard'),
        ('JUSTIFIE', 'Justifié'),
    ]
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='appels_jour')
    classe = models.ForeignKey(
        'scolarite.Classe', on_delete=models.CASCADE, related_name='appels_jour'
    )
    date = models.DateField()
    statut = models.CharField(max_length=10, choices=STATUT_CHOICES, default='PRESENT')
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='appels_jour',
    )
    # justification d'une absence : décidée par le directeur, avec le motif (maladie, raison familiale…)
    justifiee = models.BooleanField(default=False)
    motif_justification = models.CharField(max_length=200, blank=True, default='')
    justifiee_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    justifiee_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'appel_journalier'
        unique_together = [['eleve', 'classe', 'date']]
        indexes = [
            models.Index(fields=['-date'], name='appel_jour_date_idx'),
            models.Index(fields=['classe', 'date'], name='appel_jour_classe_idx'),
        ]

    def __str__(self):
        return f"{self.eleve} — {self.date} : {self.get_statut_display()}"


def _stockage_prive():
    """Pièces d'état civil : stockées hors du dossier public /media/, servies seulement via l'API (connecté + autorisé)."""
    from django.conf import settings
    from django.core.files.storage import FileSystemStorage
    return FileSystemStorage(location=settings.BASE_DIR / 'documents_prives')


class DocumentEleve(models.Model):
    """Pièce du dossier administratif d'un élève (acte de naissance, certificat de sortie…)."""
    TYPES = [
        ('ACTE_NAISSANCE', 'Acte / extrait de naissance'),
        ('QUITTANCE_SORTIE', 'Quittance / certificat de sortie (ancienne école)'),
        ('CERTIFICAT_SCOLARITE', 'Certificat de scolarité'),
        ('BULLETIN_PRECEDENT', 'Dernier bulletin / relevé de notes'),
        ('CERTIFICAT_MEDICAL', 'Certificat médical'),
        ('CARNET_VACCINATION', 'Carnet de vaccination'),
        ('PIECE_PARENT', "Pièce d'identité du parent / tuteur"),
        ('CERTIFICAT_NATIONALITE', 'Certificat de nationalité'),
        ('QUITTANCE_INSCRIPTION', "Quittance de frais d'inscription"),
        ('AUTRE', 'Autre document'),
    ]
    # pièces demandées à tout nouvel élève (les autres sont facultatives)
    ESSENTIELS = ['ACTE_NAISSANCE', 'QUITTANCE_SORTIE', 'BULLETIN_PRECEDENT', 'CERTIFICAT_MEDICAL', 'PIECE_PARENT']

    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name='documents')
    ecole = models.ForeignKey('parametres.Parametres', on_delete=models.CASCADE, null=True, blank=True, related_name='documents_eleves')
    type = models.CharField(max_length=30, choices=TYPES)
    libelle = models.CharField(max_length=150, blank=True, default='')
    fichier = models.FileField(upload_to='%Y/%m/', storage=_stockage_prive)
    nom_fichier = models.CharField(max_length=255, blank=True, default='')
    taille = models.PositiveIntegerField(default=0)
    date_ajout = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_eleve'
        ordering = ['type', '-date_ajout']

    def __str__(self):
        return f"{self.eleve} — {self.get_type_display()}"
