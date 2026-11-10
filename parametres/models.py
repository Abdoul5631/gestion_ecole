from django.conf import settings
from django.db import models
from django.utils.text import slugify


class Parametres(models.Model):
    """Une ligne = une école (tenant). Wend-Panga reste pk=1."""
    STATUT_EN_ATTENTE = 'EN_ATTENTE'
    STATUT_VALIDEE = 'VALIDEE'
    STATUT_REFUSEE = 'REFUSEE'
    STATUT_SUSPENDUE = 'SUSPENDUE'
    STATUT_CHOICES = [
        (STATUT_EN_ATTENTE, 'En attente'),
        (STATUT_VALIDEE, 'Validée'),
        (STATUT_REFUSEE, 'Refusée'),
        (STATUT_SUSPENDUE, 'Suspendue'),
    ]

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
    modele_carte        = models.CharField(max_length=20, blank=True, default='classique')
    couleur_carte       = models.CharField(max_length=7, blank=True, default='')
    # Champs pour l'en-tête du bulletin
    direction_regionale = models.CharField(max_length=200, blank=True, default='', verbose_name='Direction Régionale')
    direction_provinciale = models.CharField(max_length=200, blank=True, default='', verbose_name='Direction Provinciale')
    boite_postale       = models.CharField(max_length=50, blank=True, default='', verbose_name='Boîte Postale')
    annee_creation      = models.CharField(max_length=10, blank=True, default='', verbose_name='Année de création')
    mot_de_passe_defaut_eleves = models.CharField(
        max_length=128,
        blank=True,
        default='',
        verbose_name='Mot de passe par défaut des élèves',
        help_text='Si renseigné, les nouveaux comptes élèves de cette école démarrent avec ce mot de passe '
                  '(changement obligatoire à la première connexion). Vide = mot de passe aléatoire par élève.',
    )
    mot_de_passe_defaut_enseignants = models.CharField(
        max_length=128,
        blank=True,
        default='',
        verbose_name='Mot de passe par défaut des enseignants',
        help_text='Si renseigné, les nouveaux comptes enseignants de cette école démarrent avec ce mot de passe '
                  '(changement obligatoire à la première connexion). Vide = mot de passe aléatoire par compte.',
    )
    mot_de_passe_defaut_parents = models.CharField(
        max_length=128,
        blank=True,
        default='',
        verbose_name='Mot de passe par défaut des parents',
        help_text='Si renseigné, les nouveaux comptes parents de cette école démarrent avec ce mot de passe '
                  '(changement obligatoire à la première connexion). Vide = mot de passe aléatoire par compte.',
    )
    seuil_passage       = models.FloatField(
        default=10.0,
        verbose_name='Seuil de passage',
        help_text='Moyenne annuelle minimale pour être admis en classe supérieure (hors 3ème / Terminale).',
    )
    slug = models.SlugField(
        max_length=220,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        verbose_name='Slug site vitrine',
    )
    presentation_vitrine = models.TextField(
        blank=True,
        default='',
        verbose_name='Présentation du site vitrine',
    )
    vitrine_active = models.BooleanField(
        default=True,
        verbose_name='Site vitrine activé',
        help_text='Si l’école est VALIDEE, le site public /ecole/:slug est accessible.',
    )
    # ── Contenu du site public, réglé par le directeur (Paramètres → Site vitrine) ──
    vitrine_photo = models.ImageField(upload_to='vitrine/', null=True, blank=True,
                                      verbose_name="Photo de l'établissement (site public)")
    vitrine_atouts = models.JSONField(default=list, blank=True, verbose_name='Atouts (site public)',
                                      help_text='Jusqu’à 4 : [{"titre": …, "texte": …}]')
    vitrine_horaires = models.CharField(max_length=200, blank=True, default='', verbose_name="Horaires d'ouverture")
    vitrine_whatsapp = models.CharField(max_length=30, blank=True, default='', verbose_name='WhatsApp')
    vitrine_facebook = models.URLField(max_length=300, blank=True, default='', verbose_name='Page Facebook')
    vitrine_carte = models.URLField(max_length=500, blank=True, default='', verbose_name='Lien Google Maps')
    vitrine_afficher_tarifs = models.BooleanField(default=True, verbose_name='Afficher les tarifs')
    vitrine_afficher_classes = models.BooleanField(default=True, verbose_name='Afficher les classes')
    statut = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default=STATUT_EN_ATTENTE,
        db_index=True,
        verbose_name="Statut de l'établissement",
    )
    motif = models.TextField(blank=True, default='', verbose_name='Motif (refus ou suspension)')
    # Identité déclarée à la création (vérifiée par le super admin avant validation)
    STATUTS_JURIDIQUES = [('PUBLIC', 'Public'), ('PRIVE_LAIC', 'Privé laïc'), ('PRIVE_CONFESSIONNEL', 'Privé confessionnel'),
                          ('COMMUNAUTAIRE', 'Communautaire')]
    ORDRES = [('PRIMAIRE', 'Primaire'), ('POST_PRIMAIRE', 'Post-primaire (collège)'), ('SECONDAIRE', 'Secondaire (lycée)'),
              ('POST_PRIMAIRE_SECONDAIRE', 'Post-primaire et secondaire'), ('TECHNIQUE', 'Enseignement technique et professionnel')]
    statut_juridique = models.CharField(max_length=24, choices=STATUTS_JURIDIQUES, blank=True, default='')
    ordre_enseignement = models.CharField(max_length=30, choices=ORDRES, blank=True, default='')
    numero_autorisation = models.CharField(max_length=80, blank=True, default='', verbose_name="N° d'autorisation d'ouverture")
    telephone_directeur = models.CharField(max_length=30, blank=True, default='')
    prefixe_matricule = models.CharField(max_length=8, blank=True, default='', verbose_name='Préfixe des matricules')
    date_demande = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    date_statut = models.DateTimeField(null=True, blank=True)
    validee_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ecoles_traitees',
    )

    class Meta:
        db_table     = 'parametres'
        verbose_name = 'École / Paramètres'
        verbose_name_plural = 'Écoles'

    def __str__(self):
        return self.nom_ecole

    @property
    def est_validee(self):
        return self.statut == self.STATUT_VALIDEE

    @property
    def vitrine_publique(self):
        return self.est_validee and self.vitrine_active and bool(self.slug)

    def ensure_slug(self, force=False):
        """Génère un slug unique à partir du nom si absent (ou force=True)."""
        if self.slug and not force:
            return self.slug
        base = slugify(self.nom_ecole) or f'ecole-{self.pk or "nouvelle"}'
        candidate = base
        n = 2
        qs = Parametres.objects.all()
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        while qs.filter(slug=candidate).exists():
            candidate = f'{base}-{n}'
            n += 1
        self.slug = candidate
        return self.slug

    def save(self, *args, **kwargs):
        if not self.slug:
            self.ensure_slug()
        super().save(*args, **kwargs)

    @classmethod
    def get(cls, user=None):
        """École de l'utilisateur, sinon Wend-Panga (pk=1) pour le seed / l'existant."""
        if user is not None and getattr(user, 'ecole_id', None):
            return user.ecole
        obj, _ = cls.objects.get_or_create(
            pk=1,
            defaults={
                'nom_ecole': 'Complexe Scolaire Wend-Panga',
                'ville': 'Bobo-Dioulasso',
                'statut': cls.STATUT_VALIDEE,
            },
        )
        return obj

    @classmethod
    def for_request(cls, request):
        user = getattr(request, 'user', None)
        return cls.get(user=user)


# Alias clair : Parametres = l'établissement (tenant)
Ecole = Parametres


class AccueilPlateforme(models.Model):
    """Réglages de la page de connexion de la plateforme (une seule ligne), modifiables par le super admin."""
    titre = models.CharField(max_length=120, default='Toute votre école, dans une seule application.')
    sous_titre = models.CharField(
        max_length=300,
        default='Direction, enseignants, élèves et parents travaillent ensemble : chacun voit ce qui le concerne, au bon moment.')
    badge = models.CharField(max_length=80, blank=True, default='Pensé pour les écoles du Burkina Faso')
    couleur = models.CharField(max_length=7, default='#0b3d91')

    class Meta:
        db_table = 'accueil_plateforme'

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class PhotoAccueil(models.Model):
    """Photo du défilement de la page de connexion."""
    accueil = models.ForeignKey(AccueilPlateforme, on_delete=models.CASCADE, related_name='photos')
    image = models.ImageField(upload_to='accueil/')
    credit = models.CharField(max_length=120, blank=True, default='')
    position = models.CharField(max_length=12, default='50% 50%')  # cadrage (object-position)
    ordre = models.PositiveSmallIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = 'photo_accueil'
        ordering = ['ordre', 'id']
