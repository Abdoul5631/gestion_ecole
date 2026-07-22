from django.db import models


class Niveau(models.Model):
    nom = models.CharField(max_length=50, unique=True)
    is_active = models.BooleanField(default=True)
    is_classe_examen = models.BooleanField(
        default=False,
        help_text="Classe d'examen (BEPC, Bac...) — seules ces classes peuvent programmer un Examen Blanc."
    )

    class Meta:
        db_table = 'niveau'
        ordering = ['nom']

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

    class Meta:
        db_table = 'classe'
        unique_together = [['nom', 'niveau']]
        ordering = ['niveau', 'nom']

    def __str__(self):
        return self.nom


class AnneeScolaire(models.Model):
    libelle = models.CharField(max_length=20, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'annee_scolaire'
        ordering = ['-libelle']

    def __str__(self):
        return self.libelle


class Trimestre(models.Model):
    nom = models.CharField(max_length=50)
    annee_scolaire = models.ForeignKey(
        AnneeScolaire, on_delete=models.CASCADE, related_name='trimestres'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'trimestre'
        unique_together = [['nom', 'annee_scolaire']]
        ordering = ['annee_scolaire', 'nom']

    def __str__(self):
        return f"{self.nom} — {self.annee_scolaire}"


class Inscription(models.Model):
    date_inscription = models.DateField(auto_now_add=True)
    eleve = models.ForeignKey(
        'eleves.Eleve', on_delete=models.CASCADE, related_name='inscriptions'
    )
    classe = models.ForeignKey(
        Classe, on_delete=models.RESTRICT, related_name='inscriptions',
        null=True, blank=True
    )

    class Meta:
        db_table = 'inscription'
        ordering = ['classe', 'eleve__nom']

    def __str__(self):
        return f"{self.eleve} → {self.classe}"
