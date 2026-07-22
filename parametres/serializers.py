from rest_framework import serializers
from .models import Parametres


class ParametresSerializer(serializers.ModelSerializer):
    logo_url      = serializers.SerializerMethodField(read_only=True)
    signature_url = serializers.SerializerMethodField(read_only=True)
    tampon_url    = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model  = Parametres
        fields = [
            'id', 'nom_ecole', 'slogan', 'adresse', 'ville', 'telephone',
            'email', 'directeur', 'devise', 'logo', 'logo_url', 'couleur_primaire',
            'direction_regionale', 'direction_provinciale', 'boite_postale', 'annee_creation',
            'signature', 'signature_url',
            'tampon', 'tampon_url',
        ]

    def get_logo_url(self, obj):
        if obj.logo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.logo.url)
            return obj.logo.url
        return None

    def get_signature_url(self, obj):
        if obj.signature:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.signature.url)
            return obj.signature.url
        return None

    def get_tampon_url(self, obj):
        if obj.tampon:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.tampon.url)
            return obj.tampon.url
        return None
