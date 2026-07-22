from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLE_CHOICES = [
        ('ADMIN', 'Administrateur'),
        ('ENSEIGNANT', 'Enseignant'),
        ('PARENT', 'Parent'),
        ('ELEVE', 'Élève'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='ELEVE')
    enseignant = models.OneToOneField(
        'cours.Enseignant',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='user'
    )
    eleve = models.ForeignKey(
        'eleves.Eleve',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='comptes'
    )
    enfants = models.ManyToManyField(
        'eleves.Eleve',
        blank=True,
        related_name='parents',
        verbose_name='Enfants'
    )

    class Meta:
        db_table = 'auth_user_custom'

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"