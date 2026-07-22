from django.db import models


class Parametres(models.Model):
    nom_ecole           = models.CharField(max_length=200, default='Mon École')
    slogan              = models.CharField(max_length=300, blank=True, default='')
    adresse             = models.CharField(max_length=300, blank=True, default='')
    ville               = models.CharField(max_length=100, blank=True, default='')
    telephone           = models.CharField(max_length=30, blank=True, default='')
    email               = models.EmailField(blank=True, default='')
    directeur           = models.CharField(max_length=150, blank=True, default='')
    devise              = models.CharField(max_length=200, blank=True, default='')
    logo                = models.ImageField(upload_to='logos/', null=True, blank=True)
    signature           = models.ImageField(upload_to='signatures/', null=True, blank=True)
    tampon              = models.ImageField(upload_to='tampons/', null=True, blank=True)
    couleur_primaire    = models.CharField(max_length=7, default='#1976d2')
    # Champs pour l'en-tête du bulletin
    direction_regionale = models.CharField(max_length=200, blank=True, default='', verbose_name='Direction Régionale')
    direction_provinciale = models.CharField(max_length=200, blank=True, default='', verbose_name='Direction Provinciale')
    boite_postale       = models.CharField(max_length=50, blank=True, default='', verbose_name='Boîte Postale')
    annee_creation      = models.CharField(max_length=10, blank=True, default='', verbose_name='Année de création')

    class Meta:
        db_table     = 'parametres'
        verbose_name = 'Paramètres'

    def __str__(self):
        return self.nom_ecole

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
