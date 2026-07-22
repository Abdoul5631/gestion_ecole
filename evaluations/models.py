from django.db import models


class CalendrierComposition(models.Model):
    niveau = models.ForeignKey(
        'scolarite.Niveau', on_delete=models.CASCADE, related_name='calendriers_compo'
    )
    trimestre = models.ForeignKey(
        'scolarite.Trimestre', on_delete=models.CASCADE, related_name='calendriers_compo'
    )
    date_debut = models.DateField()
    date_fin = models.DateField()

    class Meta:
        db_table = 'calendrier_composition'
        unique_together = [['niveau', 'trimestre']]
        ordering = ['trimestre', 'niveau']

    def __str__(self):
        return f"Composition {self.niveau} — {self.trimestre}"


class ProgrammeComposition(models.Model):
    calendrier = models.ForeignKey(
        CalendrierComposition, on_delete=models.CASCADE, related_name='programmes'
    )
    matiere = models.ForeignKey(
        'cours.Matiere', on_delete=models.CASCADE, related_name='programmes_compo'
    )
    contenu = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'programme_composition'
        unique_together = [['calendrier', 'matiere']]
        ordering = ['matiere__nom']

    def __str__(self):
        return f"{self.calendrier} — {self.matiere}"


class Evaluation(models.Model):
    TYPE_CHOICES = [
        ('DEVOIR1', 'Devoir 1'),
        ('DEVOIR2', 'Devoir 2'),
        ('COMPOSITION', 'Composition'),
        ('EXAMEN_BLANC', 'Examen Blanc'),
    ]
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    coefficient = models.FloatField(default=1.0)
    date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    trimestre = models.ForeignKey(
        'scolarite.Trimestre', on_delete=models.CASCADE, related_name='evaluations'
    )
    classe_matiere = models.ForeignKey(
        'cours.ClasseMatiere', on_delete=models.CASCADE, related_name='evaluations'
    )

    class Meta:
        db_table = 'evaluation'
        ordering = ['trimestre', 'classe_matiere']

    def __str__(self):
        return f"{self.get_type_display()} — {self.classe_matiere} ({self.trimestre})"


class CalendrierExamenBlanc(models.Model):
    """Session d'Examen Blanc (dates de début/fin) pour un niveau/trimestre — même principe que CalendrierComposition."""
    niveau = models.ForeignKey(
        'scolarite.Niveau', on_delete=models.CASCADE, related_name='calendriers_examen_blanc'
    )
    trimestre = models.ForeignKey(
        'scolarite.Trimestre', on_delete=models.CASCADE, related_name='calendriers_examen_blanc'
    )
    date_debut = models.DateField()
    date_fin = models.DateField()

    class Meta:
        db_table = 'calendrier_examen_blanc'
        unique_together = [['niveau', 'trimestre']]
        ordering = ['trimestre', 'niveau']

    def __str__(self):
        return f"Examen Blanc {self.niveau} — {self.trimestre}"


class ProgrammeExamenBlanc(models.Model):
    """Programme à évaluer par matière pour une session d'Examen Blanc — même principe que ProgrammeComposition."""
    calendrier = models.ForeignKey(
        CalendrierExamenBlanc, on_delete=models.CASCADE, related_name='programmes'
    )
    matiere = models.ForeignKey(
        'cours.Matiere', on_delete=models.CASCADE, related_name='programmes_examen_blanc'
    )
    contenu = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'programme_examen_blanc'
        unique_together = [['calendrier', 'matiere']]
        ordering = ['matiere__nom']

    def __str__(self):
        return f"{self.calendrier} — {self.matiere}"


class Deliberation(models.Model):
    """Marque qu'une délibération a été effectuée pour l'Examen Blanc d'un niveau/trimestre.
    Sa présence conditionne la visibilité du classement pour les élèves/parents."""
    niveau = models.ForeignKey(
        'scolarite.Niveau', on_delete=models.CASCADE, related_name='deliberations'
    )
    trimestre = models.ForeignKey(
        'scolarite.Trimestre', on_delete=models.CASCADE, related_name='deliberations'
    )
    date_deliberation = models.DateTimeField(auto_now=True)
    decide_par = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='deliberations'
    )

    class Meta:
        db_table = 'deliberation'
        unique_together = [['niveau', 'trimestre']]
        ordering = ['-date_deliberation']

    def __str__(self):
        return f"Délibération {self.niveau} — {self.trimestre}"


class Note(models.Model):
    valeur = models.FloatField()
    evaluation = models.ForeignKey(
        Evaluation, on_delete=models.CASCADE, related_name='notes'
    )
    eleve = models.ForeignKey(
        'eleves.Eleve', on_delete=models.CASCADE, related_name='notes'
    )

    class Meta:
        db_table = 'note'
        unique_together = [['eleve', 'evaluation']]
        ordering = ['evaluation', 'eleve__nom']

    def __str__(self):
        return f"{self.eleve} — {self.evaluation} : {self.valeur}"
