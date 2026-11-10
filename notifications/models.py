from django.db import models


class Notification(models.Model):
    TYPE_CHOICES = [
        ('ABSENCE', 'Absence'),
        ('FRAIS', 'Frais de scolarité'),
        ('BULLETIN', 'Bulletin'),
        ('INFO', 'Information'),
    ]
    destinataire = models.ForeignKey(
        'accounts.User', on_delete=models.CASCADE, related_name='notifications'
    )
    type = models.CharField(max_length=12, choices=TYPE_CHOICES, default='INFO')
    titre = models.CharField(max_length=160)
    message = models.TextField()
    lu = models.BooleanField(default=False)
    eleve = models.ForeignKey(
        'eleves.Eleve', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='notifications'
    )
    lien = models.CharField(max_length=200, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='notifications',
    )

    class Meta:
        db_table = 'notification'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.titre} → {self.destinataire}"


class SmsOutbox(models.Model):
    STATUT_CHOICES = [
        ('PENDING', 'En attente'),
        ('SIMULATED', 'Simulé (démo)'),
        ('SENT', 'Envoyé'),
        ('FAILED', 'Échec'),
    ]
    telephone = models.CharField(max_length=30)
    message = models.TextField()
    type = models.CharField(max_length=12, choices=Notification.TYPE_CHOICES, default='INFO')
    statut = models.CharField(max_length=12, choices=STATUT_CHOICES, default='PENDING')
    provider = models.CharField(max_length=20, blank=True, default='stub')
    erreur = models.TextField(blank=True, default='')
    notification = models.ForeignKey(
        Notification, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='sms'
    )
    eleve = models.ForeignKey(
        'eleves.Eleve', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='sms'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='sms',
    )

    class Meta:
        db_table = 'sms_outbox'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.telephone} [{self.statut}]"
