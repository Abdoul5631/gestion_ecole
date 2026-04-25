from django.db import models


class Eleve(models.Model):
    SEXE_CHOICES = [("M", "Masculin"), ("F", "Féminin")]

    matricule = models.CharField(unique=True, max_length=20)
    nom = models.CharField(max_length=100)
    prenom = models.CharField(max_length=100)
    sexe = models.CharField(max_length=1, choices=SEXE_CHOICES)
    date_naissance = models.DateField()
    lieu_naissance = models.CharField(max_length=100, blank=True, null=True)
    est_actif = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'eleve'
        ordering = ['nom', 'prenom']

    def __str__(self):
        return f"{self.matricule} — {self.prenom} {self.nom}"


class Presence(models.Model):
    STATUT_CHOICES = [
        ("PRESENT", "Présent"),
        ("ABSENT", "Absent"),
        ("RETARD", "En retard"),
        ("EXCUSE", "Absent excusé"),
    ]
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name="presences")
    classe_matiere = models.ForeignKey(
        'cours.ClasseMatiere',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="presences"
    )
    date = models.DateField()
    statut = models.CharField(max_length=10, choices=STATUT_CHOICES, default="PRESENT")
    motif = models.TextField(blank=True, null=True)
    enregistre_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = 'presence'
        unique_together = [['eleve', 'classe_matiere', 'date']]

    def __str__(self):
        return f"{self.eleve} — {self.date} : {self.get_statut_display()}"
