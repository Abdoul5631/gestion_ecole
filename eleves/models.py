from django.db import models


class Eleve(models.Model):
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    matricule = models.CharField(max_length=20, unique=True)
    date_naissance = models.DateField(null=True, blank=True)
    lieu_naissance = models.CharField(max_length=100, blank=True, default='')
    sexe = models.CharField(max_length=1, choices=[('M', 'Masculin'), ('F', 'Féminin')], blank=True, default='')
    nom_parent = models.CharField(max_length=100, blank=True, default='')
    prenom_parent = models.CharField(max_length=100, blank=True, default='')
    telephone_parent = models.CharField(max_length=20, blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'eleve'
        ordering = ['nom', 'prenom']

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

    class Meta:
        db_table = 'presence'
        unique_together = [['eleve', 'classe_matiere', 'date']]

    def __str__(self):
        return f"{self.eleve} — {self.date} : {self.get_statut_display()}"
