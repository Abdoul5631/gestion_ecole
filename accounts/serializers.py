from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User
from eleves.models import Eleve


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['username'] = user.username
        token['email'] = user.email
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['role'] = self.user.role
        data['username'] = self.user.username
        data['email'] = self.user.email
        data['id'] = self.user.id
        return data


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    enseignant_nom = serializers.SerializerMethodField(read_only=True)
    eleve_nom = serializers.SerializerMethodField(read_only=True)
    enfants = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Eleve.objects.all(),
        required=False
    )
    enfants_details = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'password', 'enseignant', 'eleve',
                  'enseignant_nom', 'eleve_nom', 'is_active', 'enfants', 'enfants_details']

    def get_enseignant_nom(self, obj):
        if obj.enseignant:
            return obj.enseignant.nom
        return None

    def get_eleve_nom(self, obj):
        if obj.eleve:
            return f"{obj.eleve.prenom} {obj.eleve.nom}"
        return None

    def get_enfants_details(self, obj):
        return [
            {'id': e.id, 'nom': e.nom, 'prenom': e.prenom, 'matricule': e.matricule}
            for e in obj.enfants.all()
        ]

    def validate_role(self, value):
        if value == 'ADMIN':
            raise serializers.ValidationError(
                "Le rôle Administrateur ne peut pas être assigné via l'interface."
            )
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        enfants = validated_data.pop('enfants', [])
        user = User(**validated_data)
        if password:
            user.set_password(password)
        user.save()
        if enfants:
            user.enfants.set(enfants)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        enfants = validated_data.pop('enfants', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        if enfants is not None:
            instance.enfants.set(enfants)
        return instance