from rest_framework import serializers
from .models import Notification, SmsOutbox


class NotificationSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.SerializerMethodField()
    type_libelle = serializers.CharField(source='get_type_display', read_only=True)

    def get_eleve_nom(self, obj):
        if not obj.eleve:
            return None
        return f"{obj.eleve.prenom} {obj.eleve.nom}"

    class Meta:
        model = Notification
        fields = [
            'id', 'type', 'type_libelle', 'titre', 'message', 'lu',
            'eleve', 'eleve_nom', 'lien', 'created_at',
        ]
        read_only_fields = ['id', 'created_at', 'eleve_nom', 'type_libelle']


class SmsOutboxSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.SerializerMethodField()
    statut_libelle = serializers.CharField(source='get_statut_display', read_only=True)
    type_libelle = serializers.CharField(source='get_type_display', read_only=True)

    def get_eleve_nom(self, obj):
        if not obj.eleve:
            return None
        return f"{obj.eleve.prenom} {obj.eleve.nom}"

    class Meta:
        model = SmsOutbox
        fields = [
            'id', 'telephone', 'message', 'type', 'type_libelle',
            'statut', 'statut_libelle', 'provider', 'erreur',
            'eleve', 'eleve_nom', 'notification', 'created_at', 'sent_at',
        ]
        read_only_fields = fields
