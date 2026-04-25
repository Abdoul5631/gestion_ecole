from django.db import models


class Enseignant(models.Model):
    SEXE_CHOICES = [("M", "Masculin"), ("F", "Féminin")]

    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    sexe = models.CharField(max_length=1, choices=SEXE_CHOICES)
    telephone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(unique=True, max_length=150)
    date_embauche = models.DateField(blank=True, null=True)
    est_actif = models.BooleanField(default=True)

    class Meta:
        managed = False
        db_table = 'enseignant'
        ordering = ['nom', 'prenom']

    def __str__(self):
        return f"{self.prenom} {self.nom}"


class Matiere(models.Model):
    TYPE_CHOICES = [
        ('PRINCIPALE', 'Principale'),
        ('SECONDAIRE', 'Secondaire'),
        ('OPTION', 'Option'),
    ]

    code = models.CharField(unique=True, max_length=10)
    nom = models.CharField(unique=True, max_length=100)
    coefficient = models.DecimalField(max_digits=4, decimal_places=2)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='PRINCIPALE')

    class Meta:
        managed = False
        db_table = 'matiere'
        ordering = ['nom']

    def __str__(self):
        return f"{self.code} — {self.nom} (coef. {self.coefficient})"


class ClasseMatiere(models.Model):
    niveau = models.ForeignKey(
        'scolarite.Niveau',
        on_delete=models.CASCADE,
        related_name='classe_matieres'
    )
    matiere = models.ForeignKey(
        Matiere,
        on_delete=models.CASCADE,
        related_name='classe_matieres'
    )
    enseignant = models.ForeignKey(
        Enseignant,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='classe_matieres'
    )
    annee = models.ForeignKey(
        'scolarite.AnneeScolaire',
        on_delete=models.CASCADE,
        related_name='classe_matieres'
    )
    volume_horaire = models.SmallIntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'classe_matiere'
        unique_together = [['niveau', 'matiere', 'annee']]

    def __str__(self):
        return f"{self.matiere} / {self.niveau} ({self.annee})"