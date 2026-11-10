from django.db import models
from django.db.models import Sum


class TarifNiveau(models.Model):
    """Grille de frais de scolarité : 3 tranches par niveau et par année."""
    niveau = models.ForeignKey(
        'scolarite.Niveau', on_delete=models.CASCADE, related_name='tarifs'
    )
    annee_scolaire = models.ForeignKey(
        'scolarite.AnneeScolaire', on_delete=models.CASCADE, related_name='tarifs'
    )
    tranche1 = models.DecimalField(max_digits=10, decimal_places=0, default=0)
    tranche2 = models.DecimalField(max_digits=10, decimal_places=0, default=0)
    tranche3 = models.DecimalField(max_digits=10, decimal_places=0, default=0)
    is_active = models.BooleanField(default=True)
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='tarifs',
    )

    class Meta:
        db_table = 'tarif_niveau'
        unique_together = [['niveau', 'annee_scolaire']]
        ordering = ['annee_scolaire', 'niveau__nom']

    @property
    def montant_total(self):
        return (self.tranche1 or 0) + (self.tranche2 or 0) + (self.tranche3 or 0)

    def montant_tranche(self, numero):
        return {1: self.tranche1, 2: self.tranche2, 3: self.tranche3}.get(int(numero), 0) or 0

    def __str__(self):
        return f"{self.niveau} — {self.annee_scolaire} : {self.montant_total} F"


class DossierScolarite(models.Model):
    STATUT_CHOICES = [
        ('IMPAYE', 'Impayé'),
        ('PARTIEL', 'Partiel'),
        ('SOLDE', 'Soldé'),
    ]
    inscription = models.OneToOneField(
        'scolarite.Inscription', on_delete=models.CASCADE, related_name='dossier_scolarite'
    )
    montant_du = models.DecimalField(max_digits=10, decimal_places=0, default=0)
    statut = models.CharField(max_length=10, choices=STATUT_CHOICES, default='IMPAYE')
    composition_bloquee = models.BooleanField(
        default=False,
        help_text="Si oui, la composition de la classe de cet élève peut être bloquée."
    )
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='dossiers_scolarite',
    )

    class Meta:
        db_table = 'dossier_scolarite'
        ordering = ['inscription__classe', 'inscription__eleve__nom']

    @property
    def montant_paye(self):
        total = self.paiements.aggregate(s=Sum('montant'))['s']
        return total or 0

    @property
    def reste(self):
        return max(0, (self.montant_du or 0) - self.montant_paye)

    def rafraichir_statut(self):
        paye = self.montant_paye
        du = self.montant_du or 0
        if paye <= 0:
            self.statut = 'IMPAYE'
        elif du and paye >= du:
            self.statut = 'SOLDE'
        else:
            self.statut = 'PARTIEL'
        self.save(update_fields=['statut'])
        return self.statut

    def __str__(self):
        return f"Scolarité {self.inscription} — {self.get_statut_display()}"


class Paiement(models.Model):
    TRANCHE_CHOICES = [
        (1, '1re tranche'),
        (2, '2e tranche'),
        (3, '3e tranche'),
    ]
    MODE_CHOICES = [
        ('ESPECES', 'Espèces'),
        ('MOBILE', 'Mobile money'),
        ('VIREMENT', 'Virement'),
        ('CHEQUE', 'Chèque'),
    ]
    dossier = models.ForeignKey(
        DossierScolarite, on_delete=models.CASCADE, related_name='paiements'
    )
    tranche = models.PositiveSmallIntegerField(choices=TRANCHE_CHOICES, default=1)
    montant = models.DecimalField(max_digits=10, decimal_places=0)
    date_paiement = models.DateField()
    mode = models.CharField(max_length=12, choices=MODE_CHOICES, default='ESPECES')
    numero_recu = models.CharField(max_length=30, unique=True)
    recu_par = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='paiements_encaisse'
    )
    commentaire = models.CharField(max_length=200, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='paiements',
    )

    class Meta:
        db_table = 'paiement_scolarite'
        ordering = ['-date_paiement', '-id']

    def __str__(self):
        return f"{self.numero_recu} — {self.montant} F"


class Depense(models.Model):
    """Sortie d'argent de l'école (salaires, fournitures, factures…), saisie par le comptable."""
    CATEGORIE_CHOICES = [
        ('SALAIRES', 'Salaires et primes'),
        ('FOURNITURES', 'Fournitures et matériel'),
        ('FACTURES', 'Eau, électricité, internet'),
        ('ENTRETIEN', 'Entretien et réparations'),
        ('TRANSPORT', 'Transport'),
        ('EVENEMENT', 'Événements et activités'),
        ('AUTRE', 'Autre'),
    ]
    MODE_CHOICES = Paiement.MODE_CHOICES

    numero = models.CharField(max_length=30, blank=True, default='', db_index=True)  # n° de la pièce : DEP-2026-0001
    libelle = models.CharField(max_length=160)
    categorie = models.CharField(max_length=12, choices=CATEGORIE_CHOICES, default='AUTRE')
    montant = models.DecimalField(max_digits=10, decimal_places=0)
    date_depense = models.DateField()
    mode = models.CharField(max_length=12, choices=MODE_CHOICES, default='ESPECES')
    beneficiaire = models.CharField(max_length=120, blank=True, default='')
    commentaire = models.CharField(max_length=200, blank=True, default='')
    annee_scolaire = models.ForeignKey(
        'scolarite.AnneeScolaire', on_delete=models.SET_NULL, null=True, blank=True, related_name='depenses'
    )
    saisi_par = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='depenses_saisies'
    )
    is_active = models.BooleanField(default=True)  # annulée = False (on ne supprime jamais une écriture)
    created_at = models.DateTimeField(auto_now_add=True)
    ecole = models.ForeignKey(
        'parametres.Parametres', on_delete=models.CASCADE,
        null=True, blank=True, related_name='depenses',
    )

    class Meta:
        db_table = 'depense'
        ordering = ['-date_depense', '-id']

    def __str__(self):
        return f"{self.libelle} — {self.montant} F"


class CertificatNonRedevance(models.Model):
    """Certificat de non redevance délivré à un élève pour une année : son numéro ne change pas aux réimpressions."""
    ecole = models.ForeignKey('parametres.Parametres', on_delete=models.CASCADE, related_name='certificats_non_redevance')
    eleve = models.ForeignKey('eleves.Eleve', on_delete=models.CASCADE, related_name='certificats_non_redevance')
    annee_scolaire = models.ForeignKey('scolarite.AnneeScolaire', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    numero = models.CharField(max_length=20)
    delivre_par = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'certificat_non_redevance'
        constraints = [
            models.UniqueConstraint(fields=['ecole', 'numero'], name='certificat_numero_unique_par_ecole'),
            models.UniqueConstraint(fields=['eleve', 'annee_scolaire'], name='certificat_un_par_eleve_et_annee'),
        ]
