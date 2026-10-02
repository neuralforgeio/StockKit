package suppliers

import (
	"context"
	"strings"

	"github.com/neuralforgeio/StockKit/internal/crypto"
)

const maxBankAccountBytes = 256

type Service struct {
	repo   *Repository
	cipher *fieldcipher.Cipher
}

func NewService(repo *Repository, cipher *fieldcipher.Cipher) *Service {
	return &Service{repo: repo, cipher: cipher}
}

// Create validates, encrypts the bank account, and persists a new supplier.
func (s *Service) Create(ctx context.Context, tenantID string, input CreateSupplierInput) (*Supplier, error) {
	if strings.TrimSpace(input.Name) == "" {
		return nil, ErrNameRequired
	}
	if err := s.encryptInput(&input); err != nil {
		return nil, err
	}
	sup, err := s.repo.Create(ctx, tenantID, input)
	if err != nil {
		return nil, err
	}
	return s.mask(sup)
}

// GetByID returns one supplier with a masked bank account.
func (s *Service) GetByID(ctx context.Context, tenantID, id string) (*Supplier, error) {
	sup, err := s.repo.GetByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}
	return s.mask(sup)
}

// List returns all suppliers with masked bank accounts.
func (s *Service) List(ctx context.Context, tenantID string) ([]Supplier, error) {
	list, err := s.repo.List(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	out := make([]Supplier, 0, len(list))
	for i := range list {
		masked, err := s.mask(&list[i])
		if err != nil {
			return nil, err
		}
		out = append(out, *masked)
	}
	return out, nil
}

// Update validates, encrypts, and persists changes to one supplier.
func (s *Service) Update(ctx context.Context, tenantID, id string, input CreateSupplierInput) (*Supplier, error) {
	if strings.TrimSpace(input.Name) == "" {
		return nil, ErrNameRequired
	}
	if err := s.encryptInput(&input); err != nil {
		return nil, err
	}
	sup, err := s.repo.Update(ctx, tenantID, id, input)
	if err != nil {
		return nil, err
	}
	return s.mask(sup)
}

// SetActive deactivates or reactivates a supplier.
func (s *Service) SetActive(ctx context.Context, tenantID, id string, active bool) error {
	return s.repo.SetActive(ctx, tenantID, id, active)
}

// Delete soft-deletes a supplier.
func (s *Service) Delete(ctx context.Context, tenantID, id string) error {
	return s.repo.Delete(ctx, tenantID, id)
}

func (s *Service) encryptInput(input *CreateSupplierInput) error {
	if input.BankAccount == nil || *input.BankAccount == "" {
		input.BankAccount = nil
		return nil
	}
	if s.cipher == nil {
		return ErrEncryptionNotConfigured
	}
	sealed, err := s.cipher.Encrypt(*input.BankAccount)
	if err != nil {
		return err
	}
	input.BankAccount = &sealed
	return nil
}

func (s *Service) mask(sup *Supplier) (*Supplier, error) {
	if sup.BankAccount == nil || s.cipher == nil {
		return sup, nil
	}
	plain, err := s.cipher.Decrypt(*sup.BankAccount)
	if err != nil {
		return nil, err
	}
	masked := fieldcipher.Mask(plain)
	out := *sup
	out.BankAccountMasked = &masked
	return &out, nil
}
