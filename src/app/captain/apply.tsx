import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { DocPicker, type DocValue } from '../../components/DocPicker';
import { Avatar, Button, Chip, Icon, Input, Row, Screen, T } from '../../components/ui';
import { localName } from '../../i18n';
import { api, fileUrl } from '../../lib/api';
import { showError } from '../../lib/device';
import { takeAndUploadSelfie } from '../../lib/photo';
import { useAppConfig } from '../../state/appConfig';
import { useAuth } from '../../state/auth';
import { colors, radius, space } from '../../theme';

type VehicleDocType = 'annual' | 'agency' | 'contract';
const CAR_PHOTOS = 5;
const isTriple = (n: string) => n.trim().split(/\s+/).filter((w) => w.length >= 2).length >= 3;

interface Application {
  name: string | null;
  category: string;
  carModel: string;
  carColor: string;
  plateNumber: string;
  documents: null | {
    ids: {
      idFront: string;
      idBack: string;
      residenceFront: string;
      residenceBack: string;
      vehicleDocType: VehicleDocType;
      vehicleDoc: string[];
      carPhotos: string[];
    };
    urls: {
      idFront: string | null;
      idBack: string | null;
      residenceFront: string | null;
      residenceBack: string | null;
      vehicleDoc: (string | null)[];
      carPhotos: (string | null)[];
    };
  };
}

/**
 * التسجيل ككابتن: رقم الهاتف (من الدخول) + الاسم الثلاثي + السيارة
 * + الهوية الموحدة وجهين + بطاقة السكن وجهين + السنوية أو الوكالة أو عقد البيع والشراء
 * + 5 صور للكابتن ويا السيارة ← كلها توصل للوحة الإدارة للموافقة.
 */
export default function CaptainApply() {
  const { t } = useTranslation();
  const cfg = useAppConfig();
  const { me, setMe, refreshMe } = useAuth();
  const c = me?.captain;
  const [name, setName] = useState(me?.user.name ?? '');
  const [category, setCategory] = useState(c?.category ?? cfg.categories[0]?.code ?? 'taxi');
  const [carModel, setCarModel] = useState(c?.carModel ?? '');
  const [carColor, setCarColor] = useState(c?.carColor ?? '');
  const [plate, setPlate] = useState(c?.plateNumber ?? '');
  const [docs, setDocs] = useState<Record<string, DocValue | null>>({});
  const [vehicleDocType, setVehicleDocType] = useState<VehicleDocType>('annual');
  const [vehicleDocs, setVehicleDocs] = useState<(DocValue | null)[]>([null, null]);
  const [carPhotos, setCarPhotos] = useState<(DocValue | null)[]>(Array(CAR_PHOTOS).fill(null));
  const [busy, setBusy] = useState(false);

  // إعادة التقديم: نرجع المستمسكات السابقة حتى ما يعيد رفعها
  useEffect(() => {
    if (!c) return;
    api<Application | null>('/api/captain/application')
      .then((a) => {
        if (!a?.documents) return;
        const { ids, urls } = a.documents;
        const dv = (id: string | undefined, url: string | null | undefined) => (id && url ? { id, uri: fileUrl(url)! } : null);
        setDocs({
          idFront: dv(ids.idFront, urls.idFront),
          idBack: dv(ids.idBack, urls.idBack),
          residenceFront: dv(ids.residenceFront, urls.residenceFront),
          residenceBack: dv(ids.residenceBack, urls.residenceBack),
        });
        setVehicleDocType(ids.vehicleDocType);
        setVehicleDocs([dv(ids.vehicleDoc[0], urls.vehicleDoc[0]), dv(ids.vehicleDoc[1], urls.vehicleDoc[1])]);
        setCarPhotos(Array.from({ length: CAR_PHOTOS }, (_, i) => dv(ids.carPhotos[i], urls.carPhotos[i])));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDoc = (k: string) => (v: DocValue | null) => setDocs((d) => ({ ...d, [k]: v }));
  const idDone = ['idFront', 'idBack', 'residenceFront', 'residenceBack'].every((k) => docs[k]);
  const vehicleDone = !!vehicleDocs[0];
  const photosDone = carPhotos.filter(Boolean).length === CAR_PHOTOS;
  const infoDone = isTriple(name) && carModel.trim().length >= 2 && carColor.trim().length >= 2 && plate.trim().length >= 2;
  const selfieDone = !!me?.user.photoUrl;
  const valid = selfieDone && infoDone && idDone && vehicleDone && photosDone;

  const submit = async () => {
    setBusy(true);
    try {
      await api('/api/captain/apply', {
        body: {
          name: name.trim(),
          category,
          carModel: carModel.trim(),
          carColor: carColor.trim(),
          plateNumber: plate.trim(),
          documents: {
            idFront: docs.idFront!.id,
            idBack: docs.idBack!.id,
            residenceFront: docs.residenceFront!.id,
            residenceBack: docs.residenceBack!.id,
            vehicleDocType,
            vehicleDoc: vehicleDocs.filter(Boolean).map((d) => d!.id),
            carPhotos: carPhotos.map((d) => d!.id),
          },
        },
        timeoutMs: 30000,
      });
      await refreshMe();
      router.replace('/(captain)/home');
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: space.xs, marginTop: space.lg }}>
            <T v="h1">{t('captain.apply.title')}</T>
            <T v="caption">{t('captain.apply.subtitle')}</T>
          </View>

          <Pressable
            onPress={async () => {
              try {
                // الصورة الشخصية من الكاميرا الأمامية — إلزامية
                const m = await takeAndUploadSelfie();
                if (m) setMe(m);
              } catch (err) {
                showError(err);
              }
            }}
            style={{ alignSelf: 'center', alignItems: 'center', gap: space.xs }}
          >
            <View>
              <Avatar uri={me?.user.photoUrl} name={name} size={96} />
              <View style={styles.camBadge}>
                <Icon name="camera" size={16} color={colors.white} />
              </View>
            </View>
            <T v="small" color={me?.user.photoUrl ? colors.primary : colors.warning}>
              {me?.user.photoUrl ? t('profile.changePhoto') : `${t('profile.takeSelfie')} (${t('profile.required')})`}
            </T>
          </Pressable>

          {/* 1) المعلومات */}
          <Section n={1} title={t('captain.apply.stepInfo')} done={infoDone} />
          <View style={{ gap: 4 }}>
            <Input label={t('captain.apply.name')} placeholder={t('captain.apply.namePlaceholder')} value={name} onChangeText={setName} maxLength={80} />
            {name.trim() && !isTriple(name) ? (
              <T v="small" color={colors.warning}>
                {t('errors.triple_name_required')}
              </T>
            ) : null}
          </View>
          <View style={{ gap: 6 }}>
            <T v="caption">{t('captain.apply.category')}</T>
            <Row>
              {cfg.categories.map((cat) => (
                <Chip key={cat.code} label={localName(cat.name)} selected={category === cat.code} onPress={() => setCategory(cat.code)} />
              ))}
            </Row>
          </View>
          <Input label={t('captain.apply.carModel')} placeholder={t('captain.apply.carModelPlaceholder')} value={carModel} onChangeText={setCarModel} maxLength={60} />
          <Row>
            <Input containerStyle={{ flex: 1 }} label={t('captain.apply.carColor')} placeholder={t('captain.apply.carColorPlaceholder')} value={carColor} onChangeText={setCarColor} maxLength={30} />
            <Input containerStyle={{ flex: 1 }} label={t('captain.apply.plate')} placeholder={t('captain.apply.platePlaceholder')} value={plate} onChangeText={setPlate} maxLength={20} />
          </Row>

          {/* 2) الهوية والسكن */}
          <Section n={2} title={t('captain.apply.stepId')} done={idDone} />
          <Row>
            <DocPicker kind="id_front" label={t('docs.unifiedFront')} value={docs.idFront ?? null} onChange={setDoc('idFront')} />
            <DocPicker kind="id_back" label={t('docs.unifiedBack')} value={docs.idBack ?? null} onChange={setDoc('idBack')} />
          </Row>
          <Row>
            <DocPicker kind="residence_front" label={t('docs.residenceFront')} value={docs.residenceFront ?? null} onChange={setDoc('residenceFront')} icon="home-account" />
            <DocPicker kind="residence_back" label={t('docs.residenceBack')} value={docs.residenceBack ?? null} onChange={setDoc('residenceBack')} icon="home-account" />
          </Row>

          {/* 3) مستند السيارة */}
          <Section n={3} title={t('captain.apply.stepVehicle')} done={vehicleDone} />
          <Row style={{ flexWrap: 'wrap' }}>
            {(['annual', 'agency', 'contract'] as VehicleDocType[]).map((k) => (
              <Chip key={k} label={t(`docs.vehicle.${k}`)} selected={vehicleDocType === k} onPress={() => setVehicleDocType(k)} />
            ))}
          </Row>
          <Row>
            <DocPicker
              kind="vehicle_doc"
              label={`${t(`docs.vehicle.${vehicleDocType}`)} — ${t('docs.front')}`}
              value={vehicleDocs[0]}
              onChange={(v) => setVehicleDocs((a) => [v, a[1]])}
              icon="file-document-outline"
            />
            <DocPicker
              kind="vehicle_doc"
              label={`${t(`docs.vehicle.${vehicleDocType}`)} — ${t('docs.back')}`}
              value={vehicleDocs[1]}
              onChange={(v) => setVehicleDocs((a) => [a[0], v])}
              icon="file-document-outline"
            />
          </Row>
          <T v="small">{t('captain.apply.vehicleBackOptional')}</T>

          {/* 4) خمس صور للكابتن ويا السيارة */}
          <Section n={4} title={t('captain.apply.stepPhotos', { n: carPhotos.filter(Boolean).length, total: CAR_PHOTOS })} done={photosDone} />
          <T v="small">{t('captain.apply.photosHint')}</T>
          <View style={styles.grid}>
            {carPhotos.map((p, i) => (
              <View key={i} style={styles.gridItem}>
                <DocPicker
                  kind="car_photo"
                  label={t('captain.apply.photoN', { n: i + 1 })}
                  value={p}
                  onChange={(v) => setCarPhotos((a) => a.map((x, j) => (j === i ? v : x)))}
                  icon="car-side"
                  height={100}
                  style={{ minWidth: 0 }}
                />
              </View>
            ))}
          </View>

          <T v="small">{t('docs.privacy')}</T>
          <Button title={t('captain.apply.submit')} disabled={!valid} loading={busy} onPress={submit} />
          {!valid ? (
            <T v="small" center color={colors.muted}>
              {t('captain.apply.completeAll')}
            </T>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Section({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <Row style={{ marginTop: space.sm }}>
      <View style={[styles.stepNum, done && { backgroundColor: colors.success }]}>
        {done ? <Icon name="check" size={16} color={colors.white} /> : <T style={styles.stepText}>{n}</T>}
      </View>
      <T v="h3" style={{ flex: 1 }}>
        {title}
      </T>
    </Row>
  );
}

const styles = StyleSheet.create({
  camBadge: { position: 'absolute', bottom: 0, end: 0, backgroundColor: colors.primary, borderRadius: radius.pill, padding: 5, borderWidth: 2, borderColor: colors.white },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: colors.white, fontSize: 14, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  gridItem: { width: '31%', flexGrow: 1 },
});
