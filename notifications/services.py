"""Envoi SMS (passerelle HTTP générique Orange/Moov/Africa's Talking) + notifications internes."""
import json
import os
import re
from datetime import date, datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from .models import Notification, SmsOutbox


def _creds():
    api_key = (
        getattr(settings, 'SMS_API_KEY', '')
        or os.environ.get('SMS_API_KEY')
        or os.environ.get('ORANGE_SMS_API_KEY')
        or os.environ.get('MOOV_SMS_API_KEY')
        or ''
    ).strip()
    api_url = (
        getattr(settings, 'SMS_API_URL', '')
        or os.environ.get('SMS_API_URL')
        or os.environ.get('ORANGE_SMS_URL')
        or ''
    ).strip()
    sender = (
        getattr(settings, 'SMS_SENDER', '')
        or os.environ.get('SMS_SENDER')
        or 'WendPanga'
    ).strip() or 'WendPanga'
    provider = (
        getattr(settings, 'SMS_PROVIDER', '')
        or os.environ.get('SMS_PROVIDER')
        or os.environ.get('ORANGE_SMS_PROVIDER')
        or 'generic'
    ).strip() or 'generic'
    return {
        'provider': provider,
        'api_key': api_key,
        'api_url': api_url,
        'sender': sender,
        'configured': bool(api_key and api_url),
    }


def sms_config_publique():
    """Infos affichables dans l’UI (sans révéler la clé)."""
    creds = _creds()
    return {
        'configured': creds['configured'],
        'mode': 'gateway' if creds['configured'] else 'simulation',
        'sender': creds['sender'],
        'provider': creds['provider'] if creds['configured'] else 'stub',
        'api_url_renseignee': bool(creds['api_url']),
        'api_key_renseignee': bool(creds['api_key']),
        'message_ui': (
            'Passerelle SMS active.'
            if creds['configured']
            else 'Sans API SMS, le parent voit le message dans son espace.'
        ),
        'hint': (
            'Les messages partent vers Orange / Moov via SMS_API_URL.'
            if creds['configured']
            else 'Sans API SMS, le parent voit le message dans son espace.'
        ),
    }


def normalize_bf_phone(raw):
    """Normalise un numéro : Burkina Faso en 226XXXXXXXX (8 chiffres locaux) ; autre pays (écrit avec + ou 00 et son
    indicatif) en +indicatif suivi du numéro."""
    if raw is None:
        return ''
    digits = re.sub(r'\D+', '', str(raw))
    if not digits:
        return ''
    brut = str(raw).strip()
    # numéro d'un autre pays (écrit avec + ou 00 et un indicatif autre que 226) : gardé tel quel, sans zéros d'appel international
    if re.match(r'^(\+|00)', brut) and not re.match(r'^(\+|00)\s*226', brut):
        return '+' + (digits[2:] if brut.startswith('00') else digits)
    if digits.startswith('00226'):
        digits = digits[2:]
    if digits.startswith('226'):
        local = digits[3:]
        if local.startswith('0') and len(local) == 9:
            local = local[1:]
        if len(local) >= 8:
            return '226' + local[-8:]
        return '226' + local
    if len(digits) == 9 and digits.startswith('0'):
        return '226' + digits[1:]
    if len(digits) == 8:
        return '226' + digits
    if len(digits) > 8:
        return '226' + digits[-8:]
    return digits


def telephone_valide_bf(numero):
    """Numéro utilisable : Burkina Faso (226 + 8 chiffres) ou autre pays (+indicatif, 8 à 15 chiffres)."""
    return bool(re.fullmatch(r'226[0-9]{8}|\+[1-9][0-9]{7,14}', numero or ''))


def parents_de(eleve):
    """Comptes PARENT liés à l'élève (M2M enfants ou FK eleve).

    Si aucun parent n'est lié (dossiers doublons : même nom, autre matricule),
    on cherche les parents d'un homonyme dans la même classe / année.
    """
    from accounts.models import User
    from eleves.models import Eleve
    if not eleve:
        return User.objects.none()
    directs = User.objects.filter(role='PARENT').filter(
        Q(enfants=eleve) | Q(eleve=eleve)
    ).distinct()
    if directs.exists():
        return directs

    autres = Eleve.objects.filter(
        nom__iexact=(eleve.nom or '').strip(),
        prenom__iexact=(eleve.prenom or '').strip(),
    ).exclude(pk=eleve.pk)
    if not autres.exists():
        return User.objects.none()

    from scolarite.utils import get_annee_active
    annee = get_annee_active(getattr(eleve, 'ecole', None))
    ins = None
    if annee:
        ins = eleve.inscriptions.filter(annee_scolaire=annee).first()
    if ins is None:
        ins = eleve.inscriptions.order_by('-id').first()
    if ins and ins.classe_id:
        filtres = {'inscriptions__classe_id': ins.classe_id}
        if ins.annee_scolaire_id:
            filtres['inscriptions__annee_scolaire_id'] = ins.annee_scolaire_id
        autres = autres.filter(**filtres)
    if not autres.exists():
        return User.objects.none()
    return User.objects.filter(role='PARENT').filter(
        Q(enfants__in=autres) | Q(eleve__in=autres)
    ).distinct()


def comptes_a_notifier(eleve):
    """Parents liés + compte élève (notification in-app même si le SMS est simulé)."""
    from accounts.models import User
    if not eleve:
        return User.objects.none()
    ids = set(parents_de(eleve).values_list('id', flat=True))
    ids.update(
        User.objects.filter(role='ELEVE', eleve=eleve).values_list('id', flat=True)
    )
    if not ids:
        return User.objects.none()
    return User.objects.filter(id__in=ids)


def creer_notification(*, destinataire, type, titre, message, eleve=None, lien=''):
    ecole = getattr(destinataire, 'ecole', None) or getattr(eleve, 'ecole', None)
    return Notification.objects.create(
        destinataire=destinataire,
        type=type,
        titre=titre,
        message=message,
        eleve=eleve,
        lien=lien or '',
        ecole=ecole,
    )


def _envoyer_http(creds, telephone, message):
    provider = (creds['provider'] or 'generic').lower()
    if provider in ('africastalking', 'at', 'africas_talking'):
        body = urlencode({
            'username': os.environ.get('SMS_USERNAME', creds['sender']),
            'to': f'+{telephone}',
            'message': message,
            'from': creds['sender'],
        }).encode('utf-8')
        headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'apiKey': creds['api_key'],
        }
    else:
        # Webhook générique : Orange, Moov, relais local, etc.
        payload = {
            'to': telephone,
            'to_e164': f'+{telephone}',
            'from': creds['sender'],
            'sender': creds['sender'],
            'text': message,
            'message': message,
            'provider': provider,
        }
        body = json.dumps(payload).encode('utf-8')
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f"Bearer {creds['api_key']}",
            'X-API-Key': creds['api_key'],
        }
    req = Request(creds['api_url'], data=body, headers=headers, method='POST')
    try:
        with urlopen(req, timeout=15) as resp:
            status = resp.status
            raw = resp.read()[:800]
            if 200 <= status < 300:
                return True, ''
            return False, f'HTTP {status} {raw.decode("utf-8", errors="replace")}'[:500]
    except HTTPError as exc:
        detail = exc.read()[:400].decode('utf-8', errors='replace') if exc.fp else ''
        return False, f'HTTP {exc.code} {detail}'.strip()[:500]
    except URLError as exc:
        return False, f'Reseau: {exc.reason}'[:500]


def envoyer_sms(telephone, message, *, type='INFO', eleve=None, notification=None):
    """
    File d'attente SMS.
    Envoi réel seulement si SMS_API_KEY + SMS_API_URL sont définis.
    Sinon le message est stocké comme SIMULATED (démo) — la notification in-app reste créée.
    """
    original = (telephone or '').strip()
    numero = normalize_bf_phone(original)
    creds = _creds()
    ecole = getattr(eleve, 'ecole', None) or getattr(notification, 'ecole', None)
    sms = SmsOutbox.objects.create(
        telephone=numero or original or '—',
        message=message,
        type=type,
        statut='PENDING',
        provider=creds['provider'] if creds['configured'] else 'stub',
        notification=notification,
        eleve=eleve,
        ecole=ecole,
    )
    if not original:
        sms.statut = 'FAILED'
        sms.erreur = 'Numéro de téléphone parent manquant (fiche élève).'
        sms.save(update_fields=['statut', 'erreur', 'provider'])
        return sms
    if not telephone_valide_bf(numero):
        sms.statut = 'FAILED'
        sms.erreur = f'Numéro de téléphone invalide : {original!r} → {numero or "vide"}.'
        sms.telephone = numero or original
        sms.save(update_fields=['statut', 'erreur', 'telephone', 'provider'])
        return sms

    sms.telephone = numero
    if creds['configured']:
        ok, err = _envoyer_http(creds, numero, message)
        if ok:
            sms.statut = 'SENT'
            sms.sent_at = timezone.now()
            sms.erreur = ''
        else:
            sms.statut = 'FAILED'
            sms.erreur = err or 'Échec passerelle SMS.'
        sms.provider = creds['provider'] or 'gateway'
    else:
        sms.statut = 'SIMULATED'
        sms.provider = 'stub'
        sms.sent_at = timezone.now()
        sms.erreur = 'Le parent voit le message dans son espace.'
    sms.save()
    return sms


def notifier_parents(eleve, *, type, titre, message, lien='', sms_message=None):
    """Crée une notification in-app (parents + élève) + un SMS vers telephone_parent."""
    notifs = []
    for user in comptes_a_notifier(eleve):
        notifs.append(creer_notification(
            destinataire=user,
            type=type,
            titre=titre,
            message=message,
            eleve=eleve,
            lien=lien,
        ))
    tel = ''
    if eleve:
        tel = (eleve.telephone_parent or '').strip()
    sms = envoyer_sms(
        tel,
        sms_message or message,
        type=type,
        eleve=eleve,
        notification=notifs[0] if notifs else None,
    )
    return notifs, sms


def notifier_absence(eleve, jour=None, matiere_nom=''):
    """Une relance max par élève et par jour (évite le spam si plusieurs cours)."""
    jour = jour or date.today()
    if isinstance(jour, str):
        jour = date.fromisoformat(jour[:10])
    debut = datetime.combine(jour, datetime.min.time())
    fin = datetime.combine(jour, datetime.max.time())
    if timezone.is_aware(timezone.now()):
        debut = timezone.make_aware(debut)
        fin = timezone.make_aware(fin)
    deja = Notification.objects.filter(
        type='ABSENCE', eleve=eleve, created_at__range=(debut, fin)
    ).exists()
    if deja:
        return [], None
    date_txt = jour.strftime('%d/%m/%Y')
    matiere = f" ({matiere_nom})" if matiere_nom else ''
    titre = f"Absence de {eleve.prenom} {eleve.nom}"
    message = (
        f"{eleve.prenom} {eleve.nom} a été marqué(e) absent(e) le {date_txt}{matiere}. "
        f"Merci de contacter l'école si besoin."
    )
    return notifier_parents(
        eleve, type='ABSENCE', titre=titre, message=message, lien='/mes-presences',
    )


def _compter_sms(sms, acc):
    if not sms:
        acc['sans_sms'] += 1
        return
    if sms.statut == 'SENT':
        acc['sms_envoyes'] += 1
    elif sms.statut == 'SIMULATED':
        acc['sms_simules'] += 1
    elif sms.statut == 'FAILED':
        acc['sms_echecs'] += 1
    else:
        acc['sms_en_attente'] += 1


def relancer_frais(dossiers, auteur=None):
    envoyes, ignores, sans_parent = 0, 0, 0
    notifications = 0
    stats = {
        'sms_envoyes': 0, 'sms_simules': 0, 'sms_echecs': 0,
        'sms_en_attente': 0, 'sans_sms': 0,
    }
    qs = dossiers.select_related('inscription__eleve')
    for dossier in qs:
        eleve = dossier.inscription.eleve
        if dossier.statut == 'SOLDE':
            ignores += 1
            continue
        if not parents_de(eleve).exists():
            sans_parent += 1
            tel = (eleve.telephone_parent or '').strip() if eleve else ''
            if tel:
                envoyer_sms(
                    tel,
                    f"Rappel de scolarité pour {eleve.prenom} {eleve.nom}.",
                    type='FRAIS',
                    eleve=eleve,
                )
            continue
        reste = int(dossier.reste)
        titre = f"Rappel de scolarité — {eleve.prenom} {eleve.nom}"
        message = (
            f"Rappel : il reste {reste} F CFA à régler pour {eleve.prenom} {eleve.nom} "
            f"(situation : {dossier.get_statut_display()}). Merci de passer à la caisse."
        )
        notifs, sms = notifier_parents(
            eleve, type='FRAIS', titre=titre, message=message, lien='/messages',
        )
        notifications += len(notifs)
        _compter_sms(sms, stats)
        envoyes += 1
    mode = 'gateway' if _creds()['configured'] else 'simulation'
    result = {
        'envoyes': envoyes,
        'ignores': ignores,
        'sans_parent': sans_parent,
        'notifications': notifications,
        'mode': mode,
        **stats,
    }
    if envoyes:
        result['message'] = (
            'Rappel envoyé au parent (visible dans Messages).' if envoyes == 1
            else f'Rappel envoyé aux parents de {envoyes} élèves (visible dans Messages).'
        )
    elif sans_parent:
        result['detail'] = 'Aucun parent lié à cet élève'
    else:
        result['detail'] = 'Aucun dossier à relancer.'
    return result


def publier_bulletins(inscriptions, trimestre, auteur=None):
    count = 0
    for ins in inscriptions:
        eleve = ins.eleve
        titre = f"Bulletin publié — {trimestre.nom}"
        message = (
            f"Le bulletin de {eleve.prenom} {eleve.nom} pour {trimestre.nom} "
            f"({trimestre.annee_scolaire.libelle}) est disponible."
        )
        notifier_parents(
            eleve, type='BULLETIN', titre=titre, message=message, lien='/mon-bulletin',
        )
        count += 1
    return {'envoyes': count}


def envoyer_message_parent(*, eleve, message, type='INFO', titre=None):
    """Envoi manuel depuis la page SMS parents."""
    titre = titre or f"Message de l'école — {eleve.prenom} {eleve.nom}"
    notifs, sms = notifier_parents(
        eleve,
        type=type,
        titre=titre,
        message=message,
        lien='/messages',
        sms_message=message,
    )
    return {
        'notifications': len(notifs),
        'sms': {
            'id': sms.id if sms else None,
            'statut': sms.statut if sms else None,
            'statut_libelle': sms.get_statut_display() if sms else None,
            'telephone': sms.telephone if sms else '',
            'erreur': sms.erreur if sms else '',
        },
        'mode': 'gateway' if _creds()['configured'] else 'simulation',
    }


def envoyer_message_groupe(*, titre, message, type='INFO', classe=None, annee=None, ecole=None):
    """
    Un message → tous les parents, ou les parents d'une classe.
    Notification in-app pour chaque compte PARENT + SMS simulé (sans API).
    """
    from accounts.models import User
    from scolarite.models import Inscription
    from scolarite.utils import get_annee_active

    titre = (titre or '').strip() or "Message de l'école"
    message = (message or '').strip()
    parents = User.objects.filter(role='PARENT', is_active=True)
    if ecole is not None:
        parents = parents.filter(ecole=ecole)
    eleves_par_parent = {}

    if classe is not None:
        annee = annee or get_annee_active(ecole)
        ins_qs = Inscription.objects.filter(classe=classe).exclude(statut__in=['SORTI', 'DIPLOME'])
        if annee:
            ins_qs = ins_qs.filter(annee_scolaire=annee)
        eleve_ids = list(ins_qs.values_list('eleve_id', flat=True))
        parents = parents.filter(
            Q(enfants__id__in=eleve_ids) | Q(eleve_id__in=eleve_ids)
        ).distinct()
        from eleves.models import Eleve
        eleves = {e.id: e for e in Eleve.objects.filter(id__in=eleve_ids)}
        for p in parents:
            kids = list(p.enfants.filter(id__in=eleve_ids))
            if not kids and p.eleve_id in eleves:
                kids = [eleves[p.eleve_id]]
            eleves_par_parent[p.id] = kids
    else:
        for p in parents:
            kids = list(p.enfants.all())
            if not kids and p.eleve:
                kids = [p.eleve]
            eleves_par_parent[p.id] = kids

    notif_count = 0
    sms_stats = {
        'sms_envoyes': 0, 'sms_simules': 0, 'sms_echecs': 0,
        'sms_en_attente': 0, 'sans_sms': 0,
    }
    telephones_faits = set()

    for parent in parents:
        kids = eleves_par_parent.get(parent.id) or []
        eleve_ref = kids[0] if kids else None
        creer_notification(
            destinataire=parent,
            type=type,
            titre=titre,
            message=message,
            eleve=eleve_ref,
            lien='/messages',
        )
        notif_count += 1

        tel = ''
        for e in kids:
            tel = (e.telephone_parent or '').strip()
            if tel:
                break
        cle = normalize_bf_phone(tel) or tel
        if cle and cle in telephones_faits:
            continue
        if cle:
            telephones_faits.add(cle)
        sms = envoyer_sms(tel, message, type=type, eleve=eleve_ref)
        _compter_sms(sms, sms_stats)

    return {
        'parents': notif_count,
        'notifications': notif_count,
        'mode': 'gateway' if _creds()['configured'] else 'simulation',
        **sms_stats,
        'message_ui': (
            f"Message envoyé à {notif_count} parent(s). "
            "Ils le voient dans leur espace, menu Messages."
        ),
    }
