from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_user_must_change_password'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClientSyncReceipt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('client_id', models.CharField(db_index=True, max_length=64, unique=True)),
                ('path', models.CharField(blank=True, default='', max_length=255)),
                ('status_code', models.PositiveSmallIntegerField(default=200)),
                ('response_json', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='sync_receipts', to='accounts.user',
                )),
            ],
            options={
                'db_table': 'client_sync_receipt',
                'ordering': ['-created_at'],
            },
        ),
    ]
