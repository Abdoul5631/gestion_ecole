from rest_framework import serializers
from .models import TarifNiveau, DossierScolarite, Paiement, Depense


class TarifNiveauSerializer(serializers.ModelSerializer):
    niveau_nom = serializers.CharField(source='niveau.nom', read_only=True)
    annee_libelle = serializers.CharField(source='annee_scolaire.libelle', read_only=True)
    montant_total = serializers.SerializerMethodField()

    def get_montant_total(self, obj):
        return int(obj.montant_total)

    class Meta:
        model = TarifNiveau
        fields = [
            'id', 'niveau', 'niveau_nom', 'annee_scolaire', 'annee_libelle',
            'tranche1', 'tranche2', 'tranche3', 'montant_total', 'is_active',
        ]
        read_only_fields = ['id', 'niveau_nom', 'annee_libelle', 'montant_total']

    def create(self, validated_data):
        lookup = {
            'niveau': validated_data['niveau'],
            'annee_scolaire': validated_data['annee_scolaire'],
        }
        existing = TarifNiveau.objects.filter(**lookup).first()
        if existing:
            for key, value in validated_data.items():
                setattr(existing, key, value)
            existing.is_active = True
            existing.save()
            return existing
        return super().create(validated_data)


class PaiementSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source='dossier.inscription.eleve.nom', read_only=True)
    eleve_prenom = serializers.CharField(source='dossier.inscription.eleve.prenom', read_only=True)
    eleve_matricule = serializers.CharField(source='dossier.inscription.eleve.matricule', read_only=True)
    classe_nom = serializers.SerializerMethodField()
    recu_par_nom = serializers.SerializerMethodField()
    recu_par_signature = serializers.SerializerMethodField()
    tranche_libelle = serializers.CharField(source='get_tranche_display', read_only=True)
    mode_libelle = serializers.CharField(source='get_mode_display', read_only=True)
    # Situation du dossier juste après ce paiement (pour le reçu)
    annee_libelle = serializers.CharField(source='dossier.inscription.annee_scolaire.libelle', read_only=True)
    parent_nom = serializers.SerializerMethodField()
    montant_du = serializers.SerializerMethodField()
    cumul_paye = serializers.SerializerMethodField()
    reste_apres = serializers.SerializerMethodField()
    numero_versement = serializers.SerializerMethodField()
    versement_libelle = serializers.SerializerMethodField()

    def get_numero_versement(self, obj):
        return sum(1 for p in obj.dossier.paiements.all() if p.id <= obj.id)

    def get_versement_libelle(self, obj):
        n = self.get_numero_versement(obj)
        return '1er versement' if n == 1 else f'{n}e versement'

    def get_parent_nom(self, obj):
        e = obj.dossier.inscription.eleve
        return f"{e.prenom_parent} {e.nom_parent}".strip()

    def get_montant_du(self, obj):
        return int(obj.dossier.montant_du or 0)

    def get_cumul_paye(self, obj):
        return int(sum(p.montant for p in obj.dossier.paiements.all() if p.id <= obj.id))

    def get_reste_apres(self, obj):
        return max(0, self.get_montant_du(obj) - self.get_cumul_paye(obj))

    def get_classe_nom(self, obj):
        classe = obj.dossier.inscription.classe
        return classe.nom if classe else None

    def get_recu_par_signature(self, obj):
        from .signature import url_signature
        return url_signature(obj.recu_par, self.context.get('request'))

    def get_recu_par_nom(self, obj):
        if not obj.recu_par:
            return None
        nom = f"{obj.recu_par.first_name} {obj.recu_par.last_name}".strip()
        return nom or obj.recu_par.username

    class Meta:
        model = Paiement
        fields = [
            'id', 'dossier', 'tranche', 'tranche_libelle', 'montant',
            'date_paiement', 'mode', 'mode_libelle', 'numero_recu',
            'recu_par', 'recu_par_nom', 'commentaire', 'created_at',
            'eleve_nom', 'eleve_prenom', 'eleve_matricule', 'classe_nom',
            'annee_libelle', 'parent_nom', 'montant_du', 'cumul_paye', 'reste_apres',
            'numero_versement', 'versement_libelle', 'recu_par_signature',
        ]
        read_only_fields = ['id', 'numero_recu', 'recu_par', 'created_at']


class DossierScolariteSerializer(serializers.ModelSerializer):
    eleve_id = serializers.IntegerField(source='inscription.eleve_id', read_only=True)
    eleve_nom = serializers.CharField(source='inscription.eleve.nom', read_only=True)
    eleve_prenom = serializers.CharField(source='inscription.eleve.prenom', read_only=True)
    eleve_matricule = serializers.CharField(source='inscription.eleve.matricule', read_only=True)
    telephone_parent = serializers.CharField(source='inscription.eleve.telephone_parent', read_only=True)
    parent_nom = serializers.SerializerMethodField()
    classe_nom = serializers.SerializerMethodField()
    niveau_nom = serializers.SerializerMethodField()
    annee_libelle = serializers.CharField(source='inscription.annee_scolaire.libelle', read_only=True)
    annee_scolaire = serializers.IntegerField(source='inscription.annee_scolaire_id', read_only=True)
    montant_paye = serializers.SerializerMethodField()
    reste = serializers.SerializerMethodField()
    paye_t1 = serializers.SerializerMethodField()
    paye_t2 = serializers.SerializerMethodField()
    paye_t3 = serializers.SerializerMethodField()
    tranches = serializers.SerializerMethodField()
    statut_libelle = serializers.CharField(source='get_statut_display', read_only=True)
    paiements = PaiementSerializer(many=True, read_only=True)

    def get_parent_nom(self, obj):
        e = obj.inscription.eleve
        return f"{e.prenom_parent} {e.nom_parent}".strip()

    def get_classe_nom(self, obj):
        return obj.inscription.classe.nom if obj.inscription.classe else None

    def get_niveau_nom(self, obj):
        if obj.inscription.classe:
            return obj.inscription.classe.niveau.nom
        return None

    def get_montant_paye(self, obj):
        return int(obj.montant_paye)

    def get_reste(self, obj):
        return int(obj.reste)

    def _paye_tranche(self, obj, n):
        total = 0
        for p in obj.paiements.all():
            if p.tranche == n:
                total += int(p.montant)
        return total

    def _tranches(self, obj):
        """Échéancier de la grille (3 tranches), rempli dans l'ordre par le total versé : les paiements ne visent plus une tranche."""
        from .services import tarif_pour
        cache = self.__dict__.setdefault('_cache_tranches', {})
        if obj.pk in cache:
            return cache[obj.pk]
        tarif = tarif_pour(obj.inscription)
        restant = int(obj.montant_paye)
        lignes = []
        if tarif:
            for n in (1, 2, 3):
                du = int(tarif.montant_tranche(n))
                paye = min(restant, du)
                restant -= paye
                lignes.append({
                    'numero': n, 'libelle': {1: '1re tranche', 2: '2e tranche', 3: '3e tranche'}[n],
                    'montant': du, 'paye': paye, 'reste': du - paye,
                    'statut': 'SOLDE' if paye >= du else ('PARTIEL' if paye else 'A_VENIR'),
                })
        cache[obj.pk] = lignes
        return lignes

    def get_tranches(self, obj):
        return self._tranches(obj)

    def _paye_t(self, obj, n):
        lignes = self._tranches(obj)
        return lignes[n - 1]['paye'] if lignes else (int(obj.montant_paye) if n == 1 else 0)

    def get_paye_t1(self, obj):
        return self._paye_t(obj, 1)

    def get_paye_t2(self, obj):
        return self._paye_t(obj, 2)

    def get_paye_t3(self, obj):
        return self._paye_t(obj, 3)

    class Meta:
        model = DossierScolarite
        fields = [
            'id', 'inscription', 'eleve_id', 'eleve_nom', 'eleve_prenom', 'eleve_matricule',
            'telephone_parent', 'parent_nom', 'classe_nom', 'niveau_nom',
            'annee_scolaire', 'annee_libelle', 'montant_du', 'montant_paye', 'reste',
            'paye_t1', 'paye_t2', 'paye_t3', 'tranches',
            'statut', 'statut_libelle', 'composition_bloquee', 'paiements',
        ]
        read_only_fields = [
            'id', 'montant_paye', 'reste', 'statut', 'statut_libelle',
            'eleve_id', 'eleve_nom', 'eleve_prenom', 'eleve_matricule',
        ]


class DepenseSerializer(serializers.ModelSerializer):
    categorie_libelle = serializers.CharField(source='get_categorie_display', read_only=True)
    mode_libelle = serializers.CharField(source='get_mode_display', read_only=True)
    saisi_par_nom = serializers.SerializerMethodField()
    saisi_par_signature = serializers.SerializerMethodField()

    def get_saisi_par_signature(self, obj):
        from .signature import url_signature
        return url_signature(obj.saisi_par, self.context.get('request'))

    def get_saisi_par_nom(self, obj):
        u = obj.saisi_par
        if not u:
            return None
        return f"{u.first_name} {u.last_name}".strip() or u.username

    def validate_montant(self, value):
        if value <= 0:
            raise serializers.ValidationError('Le montant doit être supérieur à 0.')
        return value

    class Meta:
        model = Depense
        fields = [
            'id', 'numero', 'libelle', 'categorie', 'categorie_libelle', 'montant', 'date_depense',
            'mode', 'mode_libelle', 'beneficiaire', 'commentaire', 'saisi_par_nom', 'saisi_par_signature', 'is_active', 'created_at',
        ]
        # la date est celle du jour de la saisie : jamais choisie, jamais modifiée
        read_only_fields = ['id', 'numero', 'date_depense', 'categorie_libelle', 'mode_libelle', 'saisi_par_nom', 'saisi_par_signature', 'created_at']
