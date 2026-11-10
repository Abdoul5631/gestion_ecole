from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('scolarite', '0007_inscription_annee_scolaire'),
    ]

    operations = [
        migrations.CreateModel(
            name='TarifNiveau',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tranche1', models.DecimalField(decimal_places=0, default=0, max_digits=10)),
                ('tranche2', models.DecimalField(decimal_places=0, default=0, max_digits=10)),
                ('tranche3', models.DecimalField(decimal_places=0, default=0, max_digits=10)),
                ('annee_scolaire', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tarifs', to='scolarite.anneescolaire')),
                ('niveau', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tarifs', to='scolarite.niveau')),
            ],
            options={
                'db_table': 'tarif_niveau',
                'ordering': ['annee_scolaire', 'niveau__nom'],
                'unique_together': {('niveau', 'annee_scolaire')},
            },
        ),
        migrations.CreateModel(
            name='DossierScolarite',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('montant_du', models.DecimalField(decimal_places=0, default=0, max_digits=10)),
                ('statut', models.CharField(choices=[('IMPAYE', 'Impayé'), ('PARTIEL', 'Partiel'), ('SOLDE', 'Soldé')], default='IMPAYE', max_length=10)),
                ('composition_bloquee', models.BooleanField(default=False, help_text='Si oui, la composition de la classe de cet élève peut être bloquée.')),
                ('inscription', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='dossier_scolarite', to='scolarite.inscription')),
            ],
            options={
                'db_table': 'dossier_scolarite',
                'ordering': ['inscription__classe', 'inscription__eleve__nom'],
            },
        ),
        migrations.CreateModel(
            name='Paiement',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tranche', models.PositiveSmallIntegerField(choices=[(1, '1re tranche'), (2, '2e tranche'), (3, '3e tranche')], default=1)),
                ('montant', models.DecimalField(decimal_places=0, max_digits=10)),
                ('date_paiement', models.DateField()),
                ('mode', models.CharField(choices=[('ESPECES', 'Espèces'), ('MOBILE', 'Mobile money'), ('VIREMENT', 'Virement'), ('CHEQUE', 'Chèque')], default='ESPECES', max_length=12)),
                ('numero_recu', models.CharField(max_length=30, unique=True)),
                ('commentaire', models.CharField(blank=True, default='', max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('dossier', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='paiements', to='caisse.dossierscolarite')),
                ('recu_par', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='paiements_encaisse', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'paiement_scolarite',
                'ordering': ['-date_paiement', '-id'],
            },
        ),
    ]
