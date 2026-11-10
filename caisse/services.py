from datetime import date
from decimal import Decimal

from django.db import IntegrityError, transaction

from .models import TarifNiveau, DossierScolarite, Paiement


def tarif_pour(inscription):
    if not inscription or not inscription.classe_id or not inscription.annee_scolaire_id:
        return None
    return TarifNiveau.objects.filter(
        niveau_id=inscription.classe.niveau_id,
        annee_scolaire_id=inscription.annee_scolaire_id,
        is_active=True,
    ).first()


def ouvrir_dossier(inscription):
    """Crée (ou met à jour le montant dû) le dossier de scolarité d'une inscription."""
    tarif = tarif_pour(inscription)
    montant = Decimal(tarif.montant_total) if tarif else Decimal(0)
    ecole = getattr(inscription, 'ecole', None)
    dossier, created = DossierScolarite.objects.get_or_create(
        inscription=inscription,
        defaults={'montant_du': montant, 'statut': 'IMPAYE', 'ecole': ecole},
    )
    if not created and dossier.montant_du != montant and not dossier.paiements.exists():
        dossier.montant_du = montant
        dossier.save(update_fields=['montant_du'])
        dossier.rafraichir_statut()
    return dossier


def prochain_numero_recu(annee):
    prefix = f"REC-{(annee.libelle[:4] if annee and annee.libelle else date.today().year)}-"
    last = (
        Paiement.objects.filter(numero_recu__startswith=prefix)
        .order_by('-numero_recu')
        .values_list('numero_recu', flat=True)
        .first()
    )
    n = 1
    if last:
        try:
            n = int(str(last).split('-')[-1]) + 1
        except ValueError:
            n = Paiement.objects.filter(numero_recu__startswith=prefix).count() + 1
    return f"{prefix}{n:04d}"


def numero_certificat(dossier, delivre_par, ecole):
    """N° du certificat de non redevance : CNR-AAAA-0001, continu par école et par année civile.
    Le même élève, la même année scolaire : même numéro à chaque réimpression."""
    from django.db import transaction
    from .models import CertificatNonRedevance
    ins = dossier.inscription
    with transaction.atomic():
        DossierScolarite.objects.select_for_update().get(pk=dossier.pk)
        existant = CertificatNonRedevance.objects.filter(eleve=ins.eleve, annee_scolaire=ins.annee_scolaire).first()
        if existant:
            return existant.numero
        prefix = f"CNR-{date.today().year}-"
        dernier = (CertificatNonRedevance.objects.filter(ecole=ecole, numero__startswith=prefix)
                   .order_by('-numero').values_list('numero', flat=True).first())
        try:
            n = int(str(dernier).split('-')[-1]) + 1 if dernier else 1
        except ValueError:
            n = CertificatNonRedevance.objects.filter(ecole=ecole, numero__startswith=prefix).count() + 1
        numero = f"{prefix}{n:04d}"
        CertificatNonRedevance.objects.create(ecole=ecole, eleve=ins.eleve, annee_scolaire=ins.annee_scolaire,
                                              numero=numero, delivre_par=delivre_par)
        return numero


def prochain_numero_depense(ecole, jour=None):
    """N° de pièce d'une dépense : DEP-AAAA-0001, numérotation continue par école et par année civile."""
    from .models import Depense
    annee = (jour or date.today()).year
    prefix = f"DEP-{annee}-"
    dernier = (
        Depense.objects.filter(ecole=ecole, numero__startswith=prefix)
        .order_by('-numero').values_list('numero', flat=True).first()
    )
    try:
        n = int(str(dernier).split('-')[-1]) + 1 if dernier else 1
    except ValueError:
        n = Depense.objects.filter(ecole=ecole, numero__startswith=prefix).count() + 1
    return f"{prefix}{n:04d}"


class PaiementInvalide(Exception):
    """Encaissement refusé : le message est montré tel quel au comptable."""


MODES_AVEC_REFERENCE = ('MOBILE', 'VIREMENT', 'CHEQUE')


@transaction.atomic
def enregistrer_paiement(dossier, *, tranche=1, montant, date_paiement, mode='ESPECES',
                         recu_par=None, commentaire='', numero_recu=None, controler=False):
    """Enregistre un encaissement. Avec controler=True (saisie réelle), les règles de la caisse sont vérifiées
    SOUS VERROU sur le dossier : deux encaissements simultanés ne peuvent pas dépasser le reste à payer."""
    mode = mode or 'ESPECES'
    commentaire = (commentaire or '').strip()
    if controler:
        dossier = DossierScolarite.objects.select_for_update().select_related('inscription__annee_scolaire').get(pk=dossier.pk)
        montant = int(montant)
        if montant <= 0:
            raise PaiementInvalide('Le montant doit être supérieur à 0.')
        if dossier.statut == 'SOLDE':
            raise PaiementInvalide('La scolarité de cet élève est déjà soldée : rien à encaisser.')
        if dossier.montant_du and montant > dossier.reste:
            raise PaiementInvalide(f"Le montant dépasse le reste à payer ({int(dossier.reste):,} F).".replace(',', ' '))
        if mode in MODES_AVEC_REFERENCE and len(commentaire) < 3:
            raise PaiementInvalide('Indiquez la référence de la transaction (n° Mobile money, virement ou chèque).')
    annee = dossier.inscription.annee_scolaire
    ecole = getattr(dossier, 'ecole', None) or getattr(dossier.inscription, 'ecole', None)
    for essai in range(5):
        try:
            with transaction.atomic():
                paiement = Paiement.objects.create(
                    dossier=dossier,
                    tranche=int(tranche),
                    montant=Decimal(montant),
                    date_paiement=date_paiement,
                    mode=mode,
                    numero_recu=numero_recu or prochain_numero_recu(annee),
                    recu_par=recu_par,
                    commentaire=commentaire,
                    ecole=ecole,
                )
            break
        except IntegrityError:
            # deux reçus créés au même instant ont reçu le même numéro : on recalcule
            if numero_recu or essai == 4:
                raise
    dossier.rafraichir_statut()
    return paiement
