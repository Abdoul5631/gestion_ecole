from django.db import models
from django.core.validators import MinValueValidator


class Evaluation(models.Model):
    TYPE_CHOICES = [
        ('DEVOIR', 'Devoir'),
        ('COMPOSITION', 'Composition'),
        ('EXAMEN', 'Examen'),
        ('CONTROLE', 'Contrôle continu'),
    ]
    classe_matiere = models.ForeignKey(
        'cours.ClasseMatiere',
        on_delete=models.CASCADE,
        related_name='evaluations'
    )
    trimestre = models.ForeignKey(
        'scolarite.Trimestre',
        on_delete=models.CASCADE,
        related_name='evaluations'
    )
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    libelle = models.CharField(max_length=200, blank=True, null=True)
    date = models.DateField()
    coefficient = models.DecimalField(
        max_digits=4, decimal_places=2,
        default=1,
        validators=[MinValueValidator(0.5)]
    )
    note_sur = models.DecimalField(
        max_digits=5, decimal_places=2,
        default=20,
        help_text="Note maximale (ex: 20)"
    )

    class Meta:
        managed = False
        db_table = 'evaluation'
        ordering = ['trimestre', 'date']

    def __str__(self):
        return f"{self.get_type_display()} — {self.classe_matiere.matiere} ({self.trimestre})"


class Note(models.Model):
    eleve = models.ForeignKey(
        'eleves.Eleve',
        on_delete=models.CASCADE,
        related_name='notes'
    )
    evaluation = models.ForeignKey(
        Evaluation,
        on_delete=models.CASCADE,
        related_name='notes'
    )
    valeur = models.DecimalField(
        max_digits=5, decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    est_absent = models.BooleanField(default=False)
    observation = models.TextField(blank=True, null=True)
    saisie_le = models.DateTimeField(auto_now_add=True)
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'note'
        unique_together = [['eleve', 'evaluation']]
        ordering = ['evaluation', 'eleve__nom']

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.valeur is not None and self.evaluation_id:
            if self.valeur > self.evaluation.note_sur:
                raise ValidationError(
                    f"La note ({self.valeur}) ne peut dépasser {self.evaluation.note_sur}."
                )

    def __str__(self):
        return f"{self.eleve} — {self.evaluation} : {self.valeur}/{self.evaluation.note_sur}"