from django.db import models


class Enseignant(models.Model):
    nom = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    prenom    = models.CharField(max_length=100, blank=True, default='')
    signature = models.ImageField(upload_to='signatures_enseignants/', null=True, blank=True)

    class Meta:
        db_table = 'enseignant'
        ordering = ['nom']

    def __str__(self):
        return self.nom


class Matiere(models.Model):
    TYPE_CHOICES = [
        ('SCIENTIFIQUE', 'Scientifique'),
        ('LITTERATURE', 'Littérature'),
        ('AUTRES', 'Autres'),
    ]
    nom = models.CharField(max_length=100, unique=True)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='SCIENTIFIQUE')

    class Meta:
        db_table = 'matiere'
        ordering = ['nom']

    def __str__(self):
        return self.nom


class ClasseMatiere(models.Model):
    classe = models.ForeignKey(
        'scolarite.Classe', on_delete=models.CASCADE, related_name='classe_matieres',
        null=True, blank=True
    )
    matiere = models.ForeignKey(
        Matiere, on_delete=models.CASCADE, related_name='classe_matieres'
    )
    enseignant = models.ForeignKey(
        Enseignant, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='classe_matieres'
    )
    coef = models.FloatField(default=1.0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'classe_matiere'
        unique_together = [['classe', 'matiere']]

    def __str__(self):
        return f"{self.matiere} / {self.classe}"


class EmploiDuTemps(models.Model):
    JOURS = [
        ('LUNDI', 'Lundi'), ('MARDI', 'Mardi'), ('MERCREDI', 'Mercredi'),
        ('JEUDI', 'Jeudi'), ('VENDREDI', 'Vendredi'), ('SAMEDI', 'Samedi'),
    ]
    classe_matiere = models.ForeignKey(
        ClasseMatiere, on_delete=models.CASCADE, related_name='emplois'
    )
    jour = models.CharField(max_length=10, choices=JOURS)
    heure_debut = models.TimeField()
    heure_fin = models.TimeField()
    salle = models.CharField(max_length=50, blank=True, default='')

    class Meta:
        db_table = 'emploi_du_temps'
        ordering = ['jour', 'heure_debut']
        unique_together = [['classe_matiere', 'jour', 'heure_debut']]

    def __str__(self):
        return f"{self.classe_matiere} – {self.jour} {self.heure_debut}"
