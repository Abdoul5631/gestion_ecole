from django.db import models


class AnneeScolaire(models.Model):
    libelle = models.CharField(unique=True, max_length=20)
    date_debut = models.DateField()
    date_fin = models.DateField()
    est_active = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = 'annee_scolaire'
        ordering = ['-date_debut']

    def __str__(self):
        return self.libelle

    def save(self, *args, **kwargs):
        if self.est_active:
            AnneeScolaire.objects.exclude(pk=self.pk).update(est_active=False)
        super().save(*args, **kwargs)


class Niveau(models.Model):
    nom = models.CharField(unique=True, max_length=50)
    ordre = models.SmallIntegerField(default=0)

    class Meta:
        managed = False
        db_table = 'niveau'
        ordering = ['ordre', 'nom']

    def __str__(self):
        return self.nom


class Trimestre(models.Model):
    NOM_CHOICES = [
        ('T1', '1er Trimestre'),
        ('T2', '2ème Trimestre'),
        ('T3', '3ème Trimestre'),
    ]
    annee = models.ForeignKey(
        AnneeScolaire,
        on_delete=models.CASCADE,
        related_name='trimestres'
    )
    nom = models.CharField(max_length=2, choices=NOM_CHOICES)
    date_debut = models.DateField()
    date_fin = models.DateField()

    class Meta:
        managed = False
        db_table = 'trimestre'
        unique_together = [['annee', 'nom']]
        ordering = ['annee', 'nom']

    def __str__(self):
        return f"{self.get_nom_display()} — {self.annee}"


class Inscription(models.Model):
    STATUT_CHOICES = [
        ('EN_ATTENTE', 'En attente'),
        ('VALIDE', 'Validée'),
        ('ANNULE', 'Annulée'),
    ]
    eleve = models.ForeignKey(
        'eleves.Eleve',
        on_delete=models.CASCADE,
        related_name='inscriptions'
    )
    annee = models.ForeignKey(
        AnneeScolaire,
        on_delete=models.CASCADE,
        related_name='inscriptions'
    )
    niveau = models.ForeignKey(
        Niveau,
        on_delete=models.RESTRICT,
        related_name='inscriptions'
    )
    date_inscription = models.DateField(auto_now_add=True)
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default='EN_ATTENTE')
    montant_scolarite = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        managed = False
        db_table = 'inscription'
        unique_together = [['eleve', 'annee']]
        ordering = ['-annee', 'eleve__nom']

    def __str__(self):
        return f"{self.eleve} → {self.niveau} ({self.annee})"