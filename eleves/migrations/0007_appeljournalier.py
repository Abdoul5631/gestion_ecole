from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('eleves', '0006_ecole_tenant'),
        ('scolarite', '0010_inscription_is_active'),
        ('parametres', '0006_ecole_statut_validation'),
    ]

    operations = [
        migrations.CreateModel(
            name='AppelJournalier',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('statut', models.CharField(
                    choices=[
                        ('PRESENT', 'Présent'),
                        ('ABSENT', 'Absent'),
                        ('RETARD', 'Retard'),
                        ('JUSTIFIE', 'Justifié'),
                    ],
                    default='PRESENT',
                    max_length=10,
                )),
                ('classe', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='appels_jour',
                    to='scolarite.classe',
                )),
                ('ecole', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='appels_jour',
                    to='parametres.parametres',
                )),
                ('eleve', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='appels_jour',
                    to='eleves.eleve',
                )),
            ],
            options={
                'db_table': 'appel_journalier',
                'unique_together': {('eleve', 'classe', 'date')},
            },
        ),
        migrations.AddIndex(
            model_name='appeljournalier',
            index=models.Index(fields=['-date'], name='appel_jour_date_idx'),
        ),
        migrations.AddIndex(
            model_name='appeljournalier',
            index=models.Index(fields=['classe', 'date'], name='appel_jour_classe_idx'),
        ),
    ]
